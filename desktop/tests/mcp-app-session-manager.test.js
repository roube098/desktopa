const test = require("node:test");
const assert = require("node:assert/strict");

const { McpAppSessionManager } = require("../lib/mcp-app-session-manager");

const CONNECTOR = {
  id: "builtin-tldraw",
  name: "tldraw",
  title: "tldraw Canvas",
  url: "https://example.com/mcp",
  isBuiltIn: true,
  builtInAppId: "tldraw",
  builtInKind: "mcp-app",
  autoOpenOnExec: true,
  resourceUri: "ui://show-canvas/mcp-app.html",
};

test("McpAppSessionManager keeps one persistent session for app calls", async () => {
  const manager = new McpAppSessionManager();
  const originalFetch = global.fetch;
  const calls = [];

  try {
    global.fetch = async (_input, init = {}) => {
      const headers = Object.fromEntries(new Headers(init.headers || {}).entries());
      const payload = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({
        method: String(init.method || "GET"),
        headers,
        payload,
      });

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
              name: "tldraw",
              title: "tldraw Canvas",
            },
          },
        }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "MCP-Session-Id": "session-123",
          },
        });
      }

      if (payload?.method === "notifications/initialized") {
        return new Response("", { status: 202 });
      }

      if (payload?.method === "resources/read") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            contents: [
              {
                uri: "ui://show-canvas/mcp-app.html",
                mimeType: "text/html;profile=mcp-app",
                text: "<html><body>ok</body></html>",
              },
            ],
          },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (payload?.method === "tools/call") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            content: [
              { type: "text", text: "created canvas" },
            ],
            structuredContent: {
              canvasId: "canvas-1",
            },
            isError: false,
          },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (payload?.method === "ui/message") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: payload.id,
          result: {},
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unhandled request: ${JSON.stringify(payload)}`);
    };

    const session = await manager.openSession(CONNECTOR);
    assert.equal(session.sessionId, "session-123");
    assert.equal(session.connector.id, "builtin-tldraw");

    const readResult = await manager.readResource(session.sessionId, "ui://show-canvas/mcp-app.html");
    assert.equal(readResult.contents[0]?.mimeType, "text/html;profile=mcp-app");

    const toolResult = await manager.callTool(session.sessionId, "exec", { prompt: "draw a square" });
    assert.equal(toolResult.structuredContent.canvasId, "canvas-1");

    const messageResult = await manager.sendUiMessage(session.sessionId, {
      role: "user",
      content: [{ type: "text", text: "continue" }],
    });
    assert.deepEqual(messageResult, {});

    await manager.closeSession(session.sessionId);

    const requestSessionIds = calls
      .filter((entry) => entry.method === "POST" && entry.payload?.method !== "initialize")
      .map((entry) => entry.headers["mcp-session-id"]);
    assert.ok(requestSessionIds.every((value) => value === "session-123"));
    assert.equal(calls.at(-1)?.method, "DELETE");
    assert.equal(calls.at(-1)?.headers["mcp-session-id"], "session-123");
  } finally {
    global.fetch = originalFetch;
  }
});

test("McpAppSessionManager surfaces initialize failures", async () => {
  const manager = new McpAppSessionManager();
  const originalFetch = global.fetch;

  try {
    global.fetch = async () => new Response("", { status: 404, headers: { "Content-Type": "text/plain" } });

    await assert.rejects(
      manager.openSession(CONNECTOR),
      /does not accept MCP Streamable HTTP initialization/,
    );
  } finally {
    global.fetch = originalFetch;
  }
});
