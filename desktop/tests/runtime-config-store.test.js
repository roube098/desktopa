const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function loadRuntimeConfigStore(tempHome) {
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;

  const modulePaths = [
    require.resolve("../lib/runtime-config-store"),
    require.resolve("../lib/mcp-connector-client"),
  ];
  for (const modulePath of modulePaths) {
    delete require.cache[modulePath];
  }

  const runtimeConfigStore = require("../lib/runtime-config-store");

  return {
    runtimeConfigStore,
    restore() {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
      if (previousUserProfile === undefined) {
        delete process.env.USERPROFILE;
      } else {
        process.env.USERPROFILE = previousUserProfile;
      }
      for (const modulePath of modulePaths) {
        delete require.cache[modulePath];
      }
    },
  };
}

test("checkMcpConnector performs MCP discovery and stores capabilities", async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "excelor-runtime-config-"));
  const { runtimeConfigStore, restore } = loadRuntimeConfigStore(tempHome);
  const originalFetch = global.fetch;

  try {
    global.fetch = async (_input, init = {}) => {
      const payload = init.body ? JSON.parse(String(init.body)) : undefined;

      if (init.method === "DELETE") {
        return new Response("", { status: 204 });
      }

      if (payload?.method === "initialize") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            protocolVersion: "2025-11-25",
            capabilities: {
              tools: {},
              resources: {},
            },
            serverInfo: {
              name: "Mock MCP",
              version: "1.0.0",
            },
          },
        }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "MCP-Session-Id": "session-1",
          },
        });
      }

      if (payload?.method === "notifications/initialized") {
        return new Response("", { status: 202 });
      }

      if (payload?.method === "tools/list") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            tools: [
              {
                name: "get_quote",
                description: "Get a quote",
                inputSchema: {
                  type: "object",
                  properties: {
                    symbol: { type: "string" },
                  },
                  required: ["symbol"],
                },
              },
            ],
          },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (payload?.method === "resources/list") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            resources: [
              {
                uri: "stocks://AAPL/profile",
                name: "AAPL profile",
              },
            ],
          },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (payload?.method === "resources/templates/list") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            resourceTemplates: [
              {
                uriTemplate: "stocks://{symbol}/profile",
                name: "Profile by symbol",
              },
            ],
          },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unhandled fetch payload: ${JSON.stringify(payload)}`);
    };

    const connector = runtimeConfigStore.addMcpConnector("Mock MCP", "https://example.com/mcp");
    const checked = await runtimeConfigStore.checkMcpConnector(connector.id);

    assert.equal(checked.status, "connected");
    assert.equal(checked.discovery.protocolVersion, "2025-11-25");
    assert.deepEqual(
      checked.discovery.tools.map((entry) => entry.name),
      ["get_quote"],
    );
    assert.deepEqual(
      checked.discovery.resources.map((entry) => entry.uri),
      ["stocks://AAPL/profile"],
    );
  } finally {
    global.fetch = originalFetch;
    restore();
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

test("getMcpConnectors includes the built-in tldraw connector by default", () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "excelor-runtime-config-"));
  const { runtimeConfigStore, restore } = loadRuntimeConfigStore(tempHome);

  try {
    const connectors = runtimeConfigStore.getMcpConnectors();
    const tldrawConnector = connectors.find((connector) => connector.id === "builtin-tldraw");

    assert.ok(tldrawConnector);
    assert.equal(tldrawConnector.name, "tldraw");
    assert.equal(tldrawConnector.title, "tldraw Canvas");
    assert.equal(tldrawConnector.isBuiltIn, true);
    assert.equal(tldrawConnector.isEnabled, true);
    assert.equal(tldrawConnector.url, "https://tldraw-mcp-app.tldraw.workers.dev/mcp");
  } finally {
    restore();
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

test("built-in MCP connector overrides are merged from persisted config", () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "excelor-runtime-config-"));
  const storeDir = path.join(tempHome, ".excelor");
  fs.mkdirSync(storeDir, { recursive: true });
  fs.writeFileSync(path.join(storeDir, "runtime-config.json"), JSON.stringify({
    mcp: {
      connectors: [
        {
          id: "builtin-tldraw",
          isEnabled: false,
          status: "connected",
          updatedAt: "2026-04-09T12:00:00.000Z",
        },
      ],
    },
  }, null, 2));

  const { runtimeConfigStore, restore } = loadRuntimeConfigStore(tempHome);

  try {
    const connectors = runtimeConfigStore.getMcpConnectors();
    const tldrawConnector = connectors.find((connector) => connector.id === "builtin-tldraw");

    assert.ok(tldrawConnector);
    assert.equal(tldrawConnector.isBuiltIn, true);
    assert.equal(tldrawConnector.isEnabled, false);
    assert.equal(tldrawConnector.status, "connected");
    assert.equal(tldrawConnector.name, "tldraw");
    assert.equal(tldrawConnector.url, "https://tldraw-mcp-app.tldraw.workers.dev/mcp");
  } finally {
    restore();
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

test("deleteMcpConnector rejects built-in connectors", () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "excelor-runtime-config-"));
  const { runtimeConfigStore, restore } = loadRuntimeConfigStore(tempHome);

  try {
    assert.throws(
      () => runtimeConfigStore.deleteMcpConnector("builtin-tldraw"),
      /Built-in connectors cannot be deleted/,
    );
  } finally {
    restore();
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});
