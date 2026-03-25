const test = require("node:test");
const assert = require("node:assert/strict");

const {
  HeartbeatGatewayManager,
  buildGatewayEnv,
  writeBridgeStderr,
} = require("../lib/heartbeat-gateway-manager");

test("buildGatewayEnv includes provider and financial env vars", () => {
  const env = buildGatewayEnv({
    providerStore: {
      getExcelorExecutionConfig() {
        return {
          ok: true,
          providerId: "openai",
          modelId: "gpt-5.2-codex",
          env: {
            OPENAI_API_KEY: "sk-test",
          },
        };
      },
    },
    runtimeConfigStore: {
      getFinancialSettings() {
        return {
          dataProvider: "exa",
          apiKeys: {
            exa: "exa-key",
            tavily: "tavily-key",
          },
        };
      },
    },
  });

  assert.equal(env.OPENAI_API_KEY, "sk-test");
  assert.equal(env.EXASEARCH_API_KEY, "exa-key");
  assert.equal(env.TAVILY_API_KEY, "tavily-key");
  assert.equal(env.EXCELOR_FINANCIAL_PROVIDER, "exa");
  assert.equal(env.EXCELOR_GATEWAY_MODEL, "gpt-5.2-codex");
  assert.equal(env.EXCELOR_GATEWAY_MODEL_PROVIDER, "openai");
});

test("buildGatewayEnv rejects when provider config is invalid", () => {
  assert.throws(() => {
    buildGatewayEnv({
      providerStore: {
        getExcelorExecutionConfig() {
          return {
            ok: false,
            error: "No active provider",
          };
        },
      },
      runtimeConfigStore: {
        getFinancialSettings() {
          return {};
        },
      },
    });
  }, /No active provider/);
});

test("sendWhatsAppMessage starts the gateway when idle and then sends", async () => {
  const manager = new HeartbeatGatewayManager({
    app: { isPackaged: false },
    mainDir: process.cwd(),
    resourcesPath: process.cwd(),
    providerStore: {
      getExcelorExecutionConfig() {
        return {
          ok: true,
          providerId: "openai",
          modelId: "gpt-5.2-codex",
          env: {},
        };
      },
    },
    runtimeConfigStore: {
      getFinancialSettings() {
        return {};
      },
    },
  });

  const calls = [];
  manager.runtimeState = {
    ...manager.runtimeState,
    status: "linked",
    connected: false,
  };
  manager.ensureStarted = async () => {
    calls.push("ensureStarted");
  };
  manager.startHeartbeatGateway = async () => {
    calls.push("startHeartbeatGateway");
    manager.runtimeState = {
      ...manager.runtimeState,
      status: "running",
      connected: false,
    };
  };
  manager._waitForGatewayConnected = async () => {
    calls.push("waitForGatewayConnected");
  };
  manager._sendCommand = async (command, payload) => {
    calls.push({ command, payload });
    return { success: true, messageId: "msg-1" };
  };

  const result = await manager.sendWhatsAppMessage({ body: "Deliver this update" });

  assert.deepEqual(calls, [
    "ensureStarted",
    "startHeartbeatGateway",
    "waitForGatewayConnected",
    {
      command: "send_whatsapp_message",
      payload: { body: "Deliver this update" },
    },
  ]);
  assert.deepEqual(result, { success: true, messageId: "msg-1" });
});

test("sendWhatsAppMessage skips gateway start when already running", async () => {
  const manager = new HeartbeatGatewayManager({
    app: { isPackaged: false },
    mainDir: process.cwd(),
    resourcesPath: process.cwd(),
    providerStore: {
      getExcelorExecutionConfig() {
        return {
          ok: true,
          providerId: "openai",
          modelId: "gpt-5.2-codex",
          env: {},
        };
      },
    },
    runtimeConfigStore: {
      getFinancialSettings() {
        return {};
      },
    },
  });

  const calls = [];
  manager.runtimeState = {
    ...manager.runtimeState,
    status: "connected",
    connected: true,
  };
  manager.ensureStarted = async () => {
    calls.push("ensureStarted");
  };
  manager.startHeartbeatGateway = async () => {
    calls.push("startHeartbeatGateway");
  };
  manager._waitForGatewayConnected = async () => {
    calls.push("waitForGatewayConnected");
  };
  manager._sendCommand = async (command, payload) => {
    calls.push({ command, payload });
    return { success: true, messageId: "msg-2" };
  };

  await manager.sendWhatsAppMessage({ body: "Already running" });

  assert.deepEqual(calls, [
    "ensureStarted",
    "waitForGatewayConnected",
    {
      command: "send_whatsapp_message",
      payload: { body: "Already running" },
    },
  ]);
});

test("sendWhatsAppMessage forwards attachment payloads", async () => {
  const manager = new HeartbeatGatewayManager({
    app: { isPackaged: false },
    mainDir: process.cwd(),
    resourcesPath: process.cwd(),
    providerStore: {
      getExcelorExecutionConfig() {
        return {
          ok: true,
          providerId: "openai",
          modelId: "gpt-5.2-codex",
          env: {},
        };
      },
    },
    runtimeConfigStore: {
      getFinancialSettings() {
        return {};
      },
    },
  });

  const calls = [];
  manager.runtimeState = {
    ...manager.runtimeState,
    status: "connected",
    connected: true,
  };
  manager.ensureStarted = async () => {
    calls.push("ensureStarted");
  };
  manager._waitForGatewayConnected = async () => {
    calls.push("waitForGatewayConnected");
  };
  manager._sendCommand = async (command, payload) => {
    calls.push({ command, payload });
    return { success: true, messageId: "msg-9", fileName: "report.pdf" };
  };

  const result = await manager.sendWhatsAppMessage({
    filePath: "C:\\Users\\roube\\Documents\\My Workspace\\report.pdf",
    caption: "Quarterly summary",
  });

  assert.deepEqual(calls, [
    "ensureStarted",
    "waitForGatewayConnected",
    {
      command: "send_whatsapp_message",
      payload: {
        filePath: "C:\\Users\\roube\\Documents\\My Workspace\\report.pdf",
        caption: "Quarterly summary",
      },
    },
  ]);
  assert.deepEqual(result, { success: true, messageId: "msg-9", fileName: "report.pdf" });
});

test("writeBridgeStderr ignores broken stderr pipes", () => {
  let callbackErrorHandled = false;
  const fakeStream = {
    writable: true,
    writableEnded: false,
    destroyed: false,
    write(_message, callback) {
      callbackErrorHandled = true;
      callback(Object.assign(new Error("broken pipe"), { code: "EPIPE" }));
      return false;
    },
  };

  assert.doesNotThrow(() => {
    writeBridgeStderr("bridge stderr", fakeStream);
  });
  assert.equal(callbackErrorHandled, true);
});
