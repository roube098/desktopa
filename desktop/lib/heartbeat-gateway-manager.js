const { EventEmitter } = require("events");
const { spawn } = require("child_process");
const path = require("path");
const {
  loadHeartbeatSettings,
} = require("./heartbeat-settings-store");
const { resolveExcelorRuntimePaths } = require("./excelor-runtime-paths");
const {
  findBunExecutable,
  buildBunNotFoundMessage,
} = require("./excelor-process");

function createDefaultRuntimeState() {
  return {
    status: "idle",
    connected: false,
    linking: false,
    qrText: null,
    linkedPhone: null,
    lastError: null,
  };
}

function buildFinancialEnv(runtimeConfigStore) {
  try {
    const financial = runtimeConfigStore.getFinancialSettings();
    const apiKeys = (financial && financial.apiKeys) || {};
    const env = {};
    if (apiKeys.financialdatasets) {
      env.FINANCIAL_DATASETS_API_KEY = apiKeys.financialdatasets;
    }
    if (apiKeys.exa) {
      env.EXASEARCH_API_KEY = apiKeys.exa;
    }
    if (apiKeys.tavily) {
      env.TAVILY_API_KEY = apiKeys.tavily;
    }
    if (financial && financial.dataProvider) {
      env.EXCELOR_FINANCIAL_PROVIDER = financial.dataProvider;
    }
    return env;
  } catch (_error) {
    return {};
  }
}

function buildGatewayEnv({ providerStore, runtimeConfigStore }) {
  const executionConfig = providerStore.getExcelorExecutionConfig();
  if (!executionConfig?.ok) {
    throw new Error(executionConfig?.error || "Unable to resolve active provider configuration.");
  }

  return {
    ...(executionConfig.env || {}),
    ...buildFinancialEnv(runtimeConfigStore),
    EXCELOR_GATEWAY_MODEL: String(executionConfig.modelId || ""),
    EXCELOR_GATEWAY_MODEL_PROVIDER: String(executionConfig.providerId || ""),
  };
}

function isIgnorableStreamError(error) {
  return error?.code === "EPIPE"
    || error?.code === "ERR_STREAM_DESTROYED"
    || error?.code === "ERR_STREAM_WRITE_AFTER_END";
}

function writeBridgeStderr(message, stream = process.stderr) {
  if (!message || !stream || typeof stream.write !== "function") {
    return;
  }
  if (stream.destroyed || stream.writable === false || stream.writableEnded) {
    return;
  }

  const output = `[heartbeat-bridge] ${message}`;
  try {
    stream.write(output, (error) => {
      if (error && !isIgnorableStreamError(error)) {
        try {
          process.stdout?.write?.(`[heartbeat-bridge:error] ${error.message || String(error)}\n`);
        } catch (_fallbackError) {
          // Ignore logging fallback failures.
        }
      }
    });
  } catch (error) {
    if (isIgnorableStreamError(error)) {
      return;
    }
    try {
      process.stdout?.write?.(`[heartbeat-bridge:error] ${error.message || String(error)}\n`);
    } catch (_fallbackError) {
      // Ignore logging fallback failures.
    }
  }
}

class HeartbeatGatewayManager extends EventEmitter {
  constructor(options) {
    super();
    this.app = options.app;
    this.mainDir = options.mainDir;
    this.resourcesPath = options.resourcesPath;
    this.providerStore = options.providerStore;
    this.runtimeConfigStore = options.runtimeConfigStore;
    this.settings = loadHeartbeatSettings();
    this.runtimeState = {
      ...createDefaultRuntimeState(),
      status: this.settings?.whatsapp?.linkedPhone ? "linked" : "idle",
      linkedPhone: this.settings?.whatsapp?.linkedPhone || null,
    };
    this.proc = null;
    this.stdoutBuffer = "";
    this.pending = new Map();
    this.ready = false;
    this.startPromise = null;
  }

  getSnapshot() {
    return {
      settings: this.settings,
      state: this.runtimeState,
    };
  }

  _emitState() {
    this.emit("state", this.getSnapshot());
  }

  _resolveRuntimePaths() {
    return resolveExcelorRuntimePaths({
      appIsPackaged: this.app.isPackaged,
      mainDir: this.mainDir,
      resourcesPath: this.resourcesPath,
    });
  }

  _buildBridgeSpawnInfo() {
    const runtimePaths = this._resolveRuntimePaths();
    const bridgeScript = path.join(runtimePaths.excelorDir, "src", "gateway", "bridge.ts");
    const { bunPath, checkedPaths } = findBunExecutable({
      bundledBunPath: runtimePaths.bundledBunPath,
    });
    if (!bunPath) {
      throw new Error(buildBunNotFoundMessage(checkedPaths));
    }
    return {
      runtimePaths,
      bunPath,
      bridgeScript,
    };
  }

  async ensureStarted() {
    if (this.proc && this.ready) {
      return;
    }
    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = new Promise((resolve, reject) => {
      let settled = false;
      try {
        const { runtimePaths, bunPath, bridgeScript } = this._buildBridgeSpawnInfo();
        this.proc = spawn(bunPath, ["run", bridgeScript], {
          cwd: runtimePaths.excelorDir,
          env: {
            ...process.env,
          },
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (error) {
        settled = true;
        this.startPromise = null;
        reject(error);
        return;
      }

      this.ready = false;

      this.proc.stdout.on("data", (chunk) => {
        this.stdoutBuffer += chunk.toString();
        let newline = this.stdoutBuffer.indexOf("\n");
        while (newline >= 0) {
          const line = this.stdoutBuffer.slice(0, newline).trim();
          this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
          if (line) {
            this._handleBridgeLine(line, resolve, reject, () => {
              settled = true;
            });
          }
          newline = this.stdoutBuffer.indexOf("\n");
        }
      });

      this.proc.stderr.on("data", (chunk) => {
        const message = chunk.toString();
        writeBridgeStderr(message);
      });

      this.proc.on("error", (error) => {
        this.ready = false;
        if (!settled) {
          settled = true;
          this.startPromise = null;
          reject(error);
        }
      });

      this.proc.on("exit", (code, signal) => {
        this.ready = false;
        this.proc = null;
        this.stdoutBuffer = "";
        for (const [, pending] of this.pending) {
          clearTimeout(pending.timer);
          pending.reject(new Error(`Heartbeat bridge exited (code=${code ?? "null"}, signal=${signal ?? "null"}).`));
        }
        this.pending.clear();
        this.runtimeState = {
          ...this.runtimeState,
          status: "error",
          connected: false,
          linking: false,
          lastError: `Heartbeat bridge exited (code=${code ?? "null"}, signal=${signal ?? "null"}).`,
        };
        this._emitState();
        if (!settled) {
          settled = true;
          this.startPromise = null;
          reject(new Error(this.runtimeState.lastError));
        } else {
          this.startPromise = null;
        }
      });
    }).finally(() => {
      if (this.ready) {
        this.startPromise = null;
      }
    });

    return this.startPromise;
  }

  _handleBridgeLine(line, resolveReady, rejectReady, markSettled) {
    let message;
    try {
      message = JSON.parse(line);
    } catch (_error) {
      return;
    }

    if (message.type === "response") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.ok) {
        pending.resolve(message.result);
      } else {
        pending.reject(new Error(message.error || "Heartbeat bridge command failed."));
      }
      return;
    }

    if (message.type === "ready") {
      this.ready = true;
      this._applyBridgeState(message);
      if (this.startPromise) {
        markSettled();
        this.startPromise = null;
        resolveReady();
      }
      return;
    }

    if (message.type === "state") {
      this._applyBridgeState(message);
      return;
    }

    if (message.type === "qr") {
      this.runtimeState = {
        ...this.runtimeState,
        status: "waiting_for_qr",
        linking: true,
        qrText: String(message.qrText || ""),
      };
      this._emitState();
      return;
    }

    if (message.type === "linked") {
      this.runtimeState = {
        ...this.runtimeState,
        status: "linked",
        linking: false,
        qrText: null,
        linkedPhone: message.linkedPhone || null,
      };
      this._emitState();
      return;
    }

    if (message.type === "error") {
      const msg = String(message.message || "Unknown heartbeat bridge error.");
      this.runtimeState = {
        ...this.runtimeState,
        status: "error",
        lastError: msg,
      };
      this._emitState();
      if (this.startPromise) {
        markSettled();
        this.startPromise = null;
        rejectReady(new Error(msg));
      }
    }
  }

  _applyBridgeState(message) {
    if (message.settings && typeof message.settings === "object") {
      this.settings = message.settings;
    }
    if (message.state && typeof message.state === "object") {
      this.runtimeState = {
        ...this.runtimeState,
        ...message.state,
      };
    }
    this._emitState();
  }

  async _sendCommand(command, payload, timeoutMs = 60000) {
    await this.ensureStarted();
    if (!this.proc || !this.proc.stdin.writable) {
      throw new Error("Heartbeat bridge is not running.");
    }

    const id = `hb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const request = JSON.stringify({ id, command, payload }) + "\n";

    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Heartbeat bridge command timed out: ${command}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.proc.stdin.write(request, (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  async getHeartbeatSettings() {
    const result = await this._sendCommand("get_state", {});
    if (result?.settings) {
      this.settings = result.settings;
    }
    if (result?.state) {
      this.runtimeState = {
        ...this.runtimeState,
        ...result.state,
      };
    }
    this._emitState();
    return this.settings;
  }

  async updateHeartbeatSettings(patch) {
    const result = await this._sendCommand("save_settings", patch || {});
    if (result?.settings) {
      this.settings = result.settings;
    }
    if (result?.state) {
      this.runtimeState = {
        ...this.runtimeState,
        ...result.state,
      };
    }
    this._emitState();
    return this.settings;
  }

  async startWhatsAppLink() {
    await this._sendCommand("start_link", {});
  }

  async cancelWhatsAppLink() {
    await this._sendCommand("cancel_link", {});
  }

  async unlinkWhatsApp() {
    const result = await this._sendCommand("unlink", {});
    await this.getHeartbeatSettings();
    return result || { success: false };
  }

  async startHeartbeatGateway() {
    const env = buildGatewayEnv({
      providerStore: this.providerStore,
      runtimeConfigStore: this.runtimeConfigStore,
    });
    await this._sendCommand("start_gateway", { env });
  }

  async _waitForGatewayConnected(timeoutMs = 30000) {
    if (this.runtimeState.connected || this.runtimeState.status === "connected") {
      return;
    }

    await new Promise((resolve, reject) => {
      const onState = (snapshot) => {
        const state = snapshot?.state || {};
        if (state.connected || state.status === "connected") {
          cleanup();
          resolve();
          return;
        }
        if (state.status === "error") {
          cleanup();
          reject(new Error(state.lastError || "WhatsApp gateway failed to connect."));
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("WhatsApp gateway did not connect in time."));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        this.removeListener("state", onState);
      };

      this.on("state", onState);
    });
  }

  async sendWhatsAppMessage({ body, filePath, caption }) {
    const message = String(body || "").trim();
    const attachmentPath = String(filePath || "").trim();
    const attachmentCaption = String(caption || "").trim();

    if (!message && !attachmentPath) {
      throw new Error("WhatsApp message body or attachment filePath is required.");
    }
    if (message && attachmentPath) {
      throw new Error("Send either a WhatsApp message body or an attachment filePath, not both.");
    }
    if (attachmentCaption && !attachmentPath) {
      throw new Error("WhatsApp attachment caption requires filePath.");
    }

    await this.ensureStarted();

    const gatewayRunning = this.runtimeState.connected
      || this.runtimeState.status === "connected"
      || this.runtimeState.status === "running"
      || this.runtimeState.status === "starting";

    if (!gatewayRunning) {
      await this.startHeartbeatGateway();
    }

    await this._waitForGatewayConnected();

    return await this._sendCommand(
      "send_whatsapp_message",
      attachmentPath
        ? { filePath: attachmentPath, ...(attachmentCaption ? { caption: attachmentCaption } : {}) }
        : { body: message },
    );
  }

  async stopHeartbeatGateway() {
    await this._sendCommand("stop_gateway", {});
  }

  async stop() {
    try {
      if (this.proc && this.ready) {
        await this.stopHeartbeatGateway();
      }
    } catch (_error) {
      // ignore shutdown command failures during process teardown
    }

    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Heartbeat bridge manager is shutting down."));
    }
    this.pending.clear();

    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
    this.ready = false;
  }
}

module.exports = {
  HeartbeatGatewayManager,
  buildGatewayEnv,
  createDefaultRuntimeState,
  writeBridgeStderr,
};
