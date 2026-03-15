const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const pluginConfig = JSON.parse(
  fs
    .readFileSync(path.join(__dirname, "..", "..", "plugin-bridge", "config.json"), "utf8")
    .replace(/^\uFEFF/, ""),
);
const pluginCode = fs.readFileSync(
  path.join(__dirname, "..", "..", "plugin-bridge", "scripts", "code.js"),
  "utf8",
);

function createPluginSandbox(options = {}) {
  const timers = [];
  const parentMessages = [];
  let timerId = 0;
  let attachCalls = 0;

  const plugin = {
    button() {},
  };

  if (options.withCallCommand) {
    plugin.callCommand = function callCommand() {};
  }

  const window = {
    parent: {
      postMessage(payload) {
        parentMessages.push(payload);
      },
    },
    setTimeout(handler, delay) {
      const id = ++timerId;
      timers.push({ id, handler, delay: Number(delay) || 0 });
      return id;
    },
    clearTimeout(id) {
      const index = timers.findIndex((entry) => entry.id === id);
      if (index >= 0) timers.splice(index, 1);
    },
    PresentationBridgeCore: {
      attachMessageBridge() {
        attachCalls += 1;
      },
    },
    Asc: {
      plugin,
    },
    __flushAll(limit = 100) {
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
    context: {
      window,
      Asc: window.Asc,
    },
    window,
    plugin,
    parentMessages,
    getAttachCalls() {
      return attachCalls;
    },
  };
}

test("presentation bridge plugin config enables system startup on document-ready", () => {
  const variation = pluginConfig.variations[0];
  assert.equal(variation.isVisual, false);
  assert.equal(variation.isSystem, true);
  assert.deepEqual(variation.events, ["onDocumentContentReady"]);
});

test("presentation bridge plugin waits for callCommand before posting ready", () => {
  const sandbox = createPluginSandbox({ withCallCommand: false });
  vm.runInNewContext(pluginCode, sandbox.context);

  sandbox.window.Asc.plugin.init();
  sandbox.window.__flushAll();
  assert.equal(sandbox.getAttachCalls(), 1);
  assert.equal(sandbox.parentMessages.length, 0);

  sandbox.plugin.callCommand = function callCommand() {};
  sandbox.window.Asc.plugin.event_onDocumentContentReady();
  sandbox.window.__flushAll();

  assert.equal(sandbox.parentMessages.length, 1);
  assert.equal(sandbox.parentMessages[0].type, "presentation-bridge-ready");
});

test("presentation bridge plugin attaches and posts ready only once across init and content-ready", () => {
  const sandbox = createPluginSandbox({ withCallCommand: true });
  vm.runInNewContext(pluginCode, sandbox.context);

  sandbox.window.Asc.plugin.init();
  sandbox.window.Asc.plugin.event_onDocumentContentReady();
  sandbox.window.__flushAll();

  assert.equal(sandbox.getAttachCalls(), 1);
  assert.equal(
    sandbox.parentMessages.filter((payload) => payload.type === "presentation-bridge-ready").length,
    1,
  );
});
