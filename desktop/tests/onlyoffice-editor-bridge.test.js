const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const {
  buildOnlyOfficeEditorUrl,
  buildOnlyOfficeEditorBootstrap,
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

  function dispatch(type, event) {
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

  const editorRoot = options.editorRoot || {
    querySelector() {
      return options.nestedFrame || null;
    },
  };

  const window = {
    config: {
      documentType,
      editorConfig: {
        plugins: {
          pluginsData: ["keep-me"],
          autostart: ["keep-me"],
        },
      },
    },
    location: {
      origin: "http://localhost:8080",
    },
    parent: parentWindow,
    document: {
      getElementById(id) {
        return id === "iframeEditor" ? editorRoot : null;
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
    __dispatch(type, event) {
      dispatch(type, event);
    },
    __flushAll(limit = 50) {
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

test("injectOnlyOfficeEditorBootstrap injects the generic startup bootstrap before connectEditor", () => {
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
  assert.match(injected, /window\.__excelorOnlyOfficeConnectEditorHook/);
  assert.doesNotMatch(injected, /tool-result/);
});

test("bootstrap reports editor-ready without mutating plugin configuration", () => {
  const sandbox = createBootstrapSandbox("word", { nestedFrame: {} });
  const bootstrap = buildOnlyOfficeEditorBootstrap();

  vm.runInNewContext(bootstrap, sandbox);
  sandbox.window.__excelorOnlyOfficeConnectEditorHook();
  sandbox.window.__flushAll();

  assert.equal(sandbox.parentMessages.length, 1);
  assert.equal(sandbox.parentMessages[0].type, "onlyoffice-editor-ready");
  assert.equal(sandbox.parentMessages[0].documentType, "word");
  assert.deepEqual(
    sandbox.window.config.editorConfig.plugins,
    { pluginsData: ["keep-me"], autostart: ["keep-me"] },
  );
});

test("bootstrap forwards runtime errors to the parent window", () => {
  const sandbox = createBootstrapSandbox("slide");
  const bootstrap = buildOnlyOfficeEditorBootstrap();

  vm.runInNewContext(bootstrap, sandbox);
  sandbox.window.__dispatch("error", { message: "boom" });

  const lastMessage = sandbox.parentMessages[sandbox.parentMessages.length - 1];
  assert.equal(lastMessage.type, "onlyoffice-editor-error");
  assert.equal(lastMessage.documentType, "slide");
  assert.match(String(lastMessage.message || ""), /boom/);
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

test("local browser bridge routes stay limited to tool endpoints", () => {
  assert.equal(isLocalOnlyOfficeBridgePath("/browser/action"), true);
  assert.equal(isLocalOnlyOfficeBridgePath("/editor/tool"), true);
  assert.equal(isLocalOnlyOfficeBridgePath("/sdkjs-plugins/legacy-editor-plugin/config.json"), false);
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
