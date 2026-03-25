const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const {
  PRESENTATION_BRIDGE_GUID,
  buildOnlyOfficeEditorUrl,
  buildPresentationBridgeBootstrap,
  rewriteOnlyOfficeServiceUrls,
  injectOnlyOfficeEditorBootstrap,
  isLocalOnlyOfficeBridgePath,
  isOnlyOfficeEditorRequest,
} = require("../lib/onlyoffice-editor-bridge");

function createBootstrapSandbox(documentType, options = {}) {
  const listeners = new Map();
  const timers = [];
  const parentMessages = [];
  let timerId = 0;

  function addEventListener(type, handler) {
    if (!listeners.has(type)) {
      listeners.set(type, []);
    }
    listeners.get(type).push(handler);
  }

  function dispatchEvent(type, event) {
    const handlers = listeners.get(type) || [];
    for (const handler of handlers) {
      handler(event);
    }
  }

  const parentWindow = options.parentWindow || {
    postMessage(payload) {
      parentMessages.push(payload);
    },
  };

  const window = {
    config: {
      documentType,
      editorConfig: {
        plugins: {
          pluginsData: [],
          autostart: [],
        },
      },
    },
    location: {
      origin: "http://localhost:8080",
    },
    parent: parentWindow,
    document: {
      querySelectorAll() {
        return Array.isArray(options.frameElements) ? options.frameElements : [];
      },
      getElementById() {
        return options.editorRoot || null;
      },
    },
    addEventListener,
    setTimeout(handler, delay) {
      const id = ++timerId;
      timers.push({ id, handler, delay: Number(delay) || 0 });
      return id;
    },
    clearTimeout(id) {
      const index = timers.findIndex((entry) => entry.id === id);
      if (index >= 0) timers.splice(index, 1);
    },
    __dispatchMessage(payload, source) {
      dispatchEvent("message", { data: payload, source });
    },
    __flushTimers(limit = 20) {
      for (let i = 0; i < limit && timers.length > 0; i += 1) {
        const next = timers.shift();
        if (next && typeof next.handler === "function") {
          next.handler();
        }
      }
    },
    __flushAll(limit = 200) {
      let executed = 0;
      while (timers.length > 0 && executed < limit) {
        const next = timers.shift();
        executed += 1;
        if (next && typeof next.handler === "function") {
          next.handler();
        }
      }
    },
  };

  return {
    window,
    document: window.document,
    URL,
    parentMessages,
  };
}

test("buildOnlyOfficeEditorUrl returns a direct OnlyOffice editor URL", () => {
  const result = buildOnlyOfficeEditorUrl("http://localhost:8080", { fileName: "Deck.pptx", fileExt: "pptx" });
  assert.equal(result, "http://localhost:8080/example/editor?fileName=Deck.pptx&fileExt=pptx");
});

test("injectOnlyOfficeEditorBootstrap injects the same-origin bootstrap before connectEditor", () => {
  const html = [
    "<script>",
    "var config = { documentType: 'slide', editorConfig: { plugins: { pluginsData: [] } } };",
    "        var connectEditor = function () {",
    "          docEditor = new DocsAPI.DocEditor('iframeEditor', config);",
    "        };",
    "</script>",
  ].join("\n");

  const injected = injectOnlyOfficeEditorBootstrap(html, {});

  assert.match(injected, /onlyoffice-editor-ready/);
  assert.match(injected, /presentation-ai-bridge/);
  assert.match(injected, /presentation-bridge-ready/);
  assert.match(injected, /executePresentationRequest/);
  assert.match(injected, /BRIDGE_WAIT_TIMEOUT_MS/);
  assert.match(injected, new RegExp(PRESENTATION_BRIDGE_GUID.replace(/[{}]/g, "\\$&")));
  assert.ok(injected.indexOf("window.__excelorOnlyOfficeConnectEditorHook") < injected.indexOf("var connectEditor = function ()"));
  assert.match(injected, /window\.__excelorOnlyOfficeConnectEditorHook\(\)/);
});

test("slide bootstrap patches plugin config and autostart at runtime", () => {
  const sandbox = createBootstrapSandbox("slide");
  const bootstrap = buildPresentationBridgeBootstrap({});

  vm.runInNewContext(bootstrap, sandbox);
  sandbox.window.__excelorOnlyOfficeConnectEditorHook();

  assert.deepEqual(
    sandbox.window.config.editorConfig.plugins.pluginsData,
    ["http://localhost:8080/sdkjs-plugins/presentation-ai-bridge/config.json"],
  );
  assert.deepEqual(sandbox.window.config.editorConfig.plugins.autostart, [PRESENTATION_BRIDGE_GUID]);
});

test("rewriteOnlyOfficeServiceUrls swaps server-side download and track URLs to a container-reachable origin", () => {
  const html = [
    "<script>",
    "\"url\": \"http://localhost:8080/example/download?fileName=Apple_DCF.xlsx&useraddress=172.20.0.1\",",
    "\"callbackUrl\": \"http://localhost:8080/example/track?filename=Apple_DCF.xlsx&useraddress=172.20.0.1\",",
    "\"embedUrl\": \"http://localhost:8080/example/download?fileName=Apple_DCF.xlsx\",",
    "\"template\": { \"url\": \"http://localhost:8080/example/editor?fileExt=xlsx\" }",
    "</script>",
  ].join("\n");

  const rewritten = rewriteOnlyOfficeServiceUrls(html, {
    browserOrigins: ["http://localhost:8080", "http://127.0.0.1:8080"],
    containerOrigin: "http://172.20.0.1:8080",
  });

  assert.match(rewritten, /"url": "http:\/\/172\.20\.0\.1:8080\/example\/download\?fileName=Apple_DCF\.xlsx/);
  assert.match(rewritten, /"callbackUrl": "http:\/\/172\.20\.0\.1:8080\/example\/track\?filename=Apple_DCF\.xlsx/);
  assert.match(rewritten, /"embedUrl": "http:\/\/localhost:8080\/example\/download\?fileName=Apple_DCF\.xlsx"/);
  assert.match(rewritten, /"template": \{ "url": "http:\/\/localhost:8080\/example\/editor\?fileExt=xlsx" \}/);
});

test("non-slide bootstrap leaves plugin config untouched", () => {
  const sandbox = createBootstrapSandbox("word");
  const bootstrap = buildPresentationBridgeBootstrap({});

  vm.runInNewContext(bootstrap, sandbox);
  sandbox.window.__excelorOnlyOfficeConnectEditorHook();

  assert.deepEqual(sandbox.window.config.editorConfig.plugins.pluginsData, []);
  assert.deepEqual(sandbox.window.config.editorConfig.plugins.autostart, []);
});

test("bridge-ready handshake caches a direct bridge window for relay", () => {
  const sandbox = createBootstrapSandbox("slide");
  const bootstrap = buildPresentationBridgeBootstrap({});
  const bridgeCalls = [];
  const bridgeWindow = {
    location: { href: "http://localhost:8080/bridge/hidden" },
    document: { querySelectorAll() { return []; } },
    PresentationBridgeCore: {
      executePresentationRequest(payload, callback) {
        bridgeCalls.push(payload);
        callback({ success: true, message: "ok", data: { source: "handshake" } });
      },
    },
  };

  vm.runInNewContext(bootstrap, sandbox);
  sandbox.window.__dispatchMessage(
    { type: "presentation-bridge-ready", bridgeGuid: PRESENTATION_BRIDGE_GUID },
    bridgeWindow,
  );
  sandbox.window.__dispatchMessage(
    { type: "apply-actions", requestId: "req-handshake", actions: [{ type: "set_slide_text" }] },
    sandbox.window.parent,
  );

  assert.equal(bridgeCalls.length, 1);
  assert.equal(bridgeCalls[0].requestId, "req-handshake");
  assert.equal(sandbox.parentMessages.length > 0, true);
  assert.equal(sandbox.parentMessages[sandbox.parentMessages.length - 1].success, true);
});

test("bootstrap forwards presentation-bridge-ready signal to parent", () => {
  const sandbox = createBootstrapSandbox("slide");
  const bootstrap = buildPresentationBridgeBootstrap({});
  const bridgeWindow = {
    location: { href: "http://localhost:8080/sdkjs-plugins/presentation-ai-bridge/index.html" },
    document: { querySelectorAll() { return []; } },
  };

  vm.runInNewContext(bootstrap, sandbox);
  sandbox.window.__dispatchMessage(
    { type: "presentation-bridge-ready", bridgeGuid: PRESENTATION_BRIDGE_GUID },
    bridgeWindow,
  );

  const lastMessage = sandbox.parentMessages[sandbox.parentMessages.length - 1];
  assert.equal(lastMessage.type, "presentation-bridge-ready");
  assert.equal(lastMessage.bridgeGuid, PRESENTATION_BRIDGE_GUID);
});

test("pre-ready request retries and succeeds after bridge-ready arrives", () => {
  const sandbox = createBootstrapSandbox("slide");
  const bootstrap = buildPresentationBridgeBootstrap({});
  const bridgeCalls = [];
  const bridgeWindow = {
    location: { href: "http://localhost:8080/hidden-bridge" },
    document: { querySelectorAll() { return []; } },
    PresentationBridgeCore: {
      executePresentationRequest(payload, callback) {
        bridgeCalls.push(payload);
        callback({ success: true, message: "ok after ready" });
      },
    },
  };

  vm.runInNewContext(bootstrap, sandbox);
  sandbox.window.__dispatchMessage(
    { type: "apply-actions", requestId: "req-pre-ready", actions: [{ type: "add_slide" }] },
    sandbox.window.parent,
  );

  sandbox.window.__dispatchMessage(
    { type: "presentation-bridge-ready", bridgeGuid: PRESENTATION_BRIDGE_GUID },
    bridgeWindow,
  );
  sandbox.window.__flushAll();

  assert.equal(bridgeCalls.length, 1);
  const finalMessage = sandbox.parentMessages[sandbox.parentMessages.length - 1];
  assert.equal(finalMessage.type, "tool-result");
  assert.equal(finalMessage.success, true);
});

test("postMessage bridge watchdog returns explicit timeout diagnostics", () => {
  const bridgeFrameWindow = {
    location: { href: "http://localhost:8080/sdkjs-plugins/presentation-ai-bridge/index.html" },
    document: { querySelectorAll() { return []; } },
    postMessage() {
      // Simulate a bridge that accepts the request but never responds.
    },
  };
  const sandbox = createBootstrapSandbox("slide", {
    frameElements: [{ contentWindow: bridgeFrameWindow }],
  });
  const bootstrap = buildPresentationBridgeBootstrap({});

  vm.runInNewContext(bootstrap, sandbox);
  sandbox.window.__dispatchMessage(
    { type: "apply-actions", requestId: "req-watchdog", actions: [{ type: "add_slide" }] },
    sandbox.window.parent,
  );
  sandbox.window.__flushAll();

  const finalMessage = sandbox.parentMessages[sandbox.parentMessages.length - 1];
  assert.equal(finalMessage.type, "tool-result");
  assert.equal(finalMessage.success, false);
  assert.match(String(finalMessage.message || ""), /Timed out waiting for the OnlyOffice presentation bridge/i);
  assert.equal(finalMessage.data.bridgeTimeoutMs, 9000);
  assert.equal(finalMessage.data.relayMode, "postMessage");
});

test("transient plugin-runtime-unavailable result is retried before finalizing", () => {
  let callCount = 0;
  const bridgeFrameWindow = {
    location: { href: "http://localhost:8080/any-frame" },
    document: { querySelectorAll() { return []; } },
    PresentationBridgeCore: {
      executePresentationRequest(_payload, callback) {
        callCount += 1;
        if (callCount === 1) {
          callback({ success: false, message: "OnlyOffice plugin runtime is unavailable." });
          return;
        }
        callback({ success: true, message: "Recovered after runtime init" });
      },
    },
  };
  const sandbox = createBootstrapSandbox("slide", {
    frameElements: [{ contentWindow: bridgeFrameWindow }],
  });
  const bootstrap = buildPresentationBridgeBootstrap({});

  vm.runInNewContext(bootstrap, sandbox);
  sandbox.window.__dispatchMessage(
    { type: "apply-actions", requestId: "req-transient", actions: [{ type: "set_slide_text" }] },
    sandbox.window.parent,
  );
  sandbox.window.__flushAll();

  assert.equal(callCount, 2);
  const finalMessage = sandbox.parentMessages[sandbox.parentMessages.length - 1];
  assert.equal(finalMessage.type, "tool-result");
  assert.equal(finalMessage.success, true);
  assert.equal(finalMessage.data.retryAttempts, 1);
});

test("bridge relay falls back to direct capability when URL fragment does not match", () => {
  const bridgeCalls = [];
  const bridgeFrameWindow = {
    location: { href: "http://localhost:8080/unrelated-frame" },
    document: { querySelectorAll() { return []; } },
    postMessage() {
      throw new Error("direct capability should be preferred over postMessage");
    },
    PresentationBridgeCore: {
      executePresentationRequest(payload, callback) {
        bridgeCalls.push(payload);
        callback({ success: true, message: "direct bridge executed" });
      },
    },
  };
  const sandbox = createBootstrapSandbox("slide", {
    frameElements: [{ contentWindow: bridgeFrameWindow }],
  });
  const bootstrap = buildPresentationBridgeBootstrap({});

  vm.runInNewContext(bootstrap, sandbox);
  sandbox.window.__dispatchMessage(
    { type: "apply-actions", requestId: "req-direct", actions: [{ type: "add_slide" }] },
    sandbox.window.parent,
  );

  assert.equal(bridgeCalls.length, 1);
  assert.equal(bridgeCalls[0].requestId, "req-direct");
  const finalMessage = sandbox.parentMessages[sandbox.parentMessages.length - 1];
  assert.equal(finalMessage.success, true);
  assert.equal(/not available/i.test(String(finalMessage.message || "")), false);
});

test("local browser bridge routes stay limited to tool endpoints", () => {
  assert.equal(isLocalOnlyOfficeBridgePath("/browser/action"), true);
  assert.equal(isLocalOnlyOfficeBridgePath("/editor/tool"), true);
  assert.equal(isLocalOnlyOfficeBridgePath("/sdkjs-plugins/presentation-ai-bridge/config.json"), false);
  assert.equal(isLocalOnlyOfficeBridgePath("/example/editor"), false);
});

test("isOnlyOfficeEditorRequest matches direct OnlyOffice editor URLs only", () => {
  assert.equal(isOnlyOfficeEditorRequest("http://localhost:8080/example/editor?fileName=Deck.pptx", { onlyofficePort: 8080 }), true);
  assert.equal(isOnlyOfficeEditorRequest("http://127.0.0.1:8080/example/editor?fileName=Book1.xlsx", { onlyofficePort: 8080 }), true);
  assert.equal(isOnlyOfficeEditorRequest("http://localhost:8080/web-apps/apps/api/documents/api.js", { onlyofficePort: 8080 }), false);
  assert.equal(isOnlyOfficeEditorRequest("http://localhost:43123/example/editor?fileName=Deck.pptx", { onlyofficePort: 8080 }), false);
});

test("injectOnlyOfficeEditorBootstrap leaves non-editor markup unchanged", () => {
  const html = "<html><body><h1>Not an editor shell</h1></body></html>";
  assert.equal(injectOnlyOfficeEditorBootstrap(html, {}), html);
});
