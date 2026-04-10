const DEFAULT_PROTOCOL_VERSION = "2025-11-25";
const DEFAULT_TIMEOUT_MS = 10000;

const CLIENT_INFO = {
  name: "Excelor",
  title: "Excelor Desktop",
  version: "1.0.0",
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildHeaders(protocolVersion, sessionId, hasBody = true) {
  const headers = {
    Accept: "application/json, text/event-stream",
    "User-Agent": "Excelor/1.0",
  };

  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }
  if (protocolVersion) {
    headers["MCP-Protocol-Version"] = protocolVersion;
  }
  if (sessionId) {
    headers["MCP-Session-Id"] = sessionId;
  }

  return headers;
}

function parseSsePayload(body) {
  const events = [];
  for (const block of String(body || "").split(/\r?\n\r?\n/)) {
    const dataLines = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());
    if (dataLines.length === 0) {
      continue;
    }

    const payload = dataLines.join("\n");
    if (!payload || payload === "[DONE]") {
      continue;
    }

    try {
      events.push(JSON.parse(payload));
    } catch {
      // Ignore non-JSON SSE payloads.
    }
  }
  return events;
}

async function parseRpcResponse(response, expectedId) {
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const sessionId = response.headers.get("MCP-Session-Id");
  const isSse = /\btext\/event-stream\b/i.test(contentType);

  if (!text.trim()) {
    return {
      contentType,
      status: response.status,
      sessionId,
    };
  }

  if (isSse) {
    const rawEvents = parseSsePayload(text);
    return {
      contentType,
      status: response.status,
      sessionId,
      rawEvents,
      envelope: rawEvents.find((entry) => expectedId === undefined || entry.id === expectedId),
    };
  }

  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    envelope = undefined;
  }

  return {
    contentType,
    status: response.status,
    sessionId,
    envelope,
  };
}

function errorMessage(connector, method, parsed) {
  if (parsed?.envelope?.error?.message) {
    return `${connector.name} ${method} failed: ${parsed.envelope.error.message}`;
  }
  return `${connector.name} ${method} failed with HTTP ${parsed?.status ?? "unknown"}`;
}

async function sendRpcRequest(connector, request, session) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(connector.url, {
      method: "POST",
      headers: buildHeaders(session?.protocolVersion, session?.sessionId, true),
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    return await parseRpcResponse(response, request.id);
  } finally {
    clearTimeout(timeout);
  }
}

async function sendSessionRequest(connector, session, id, method, params) {
  const parsed = await sendRpcRequest(connector, {
    jsonrpc: "2.0",
    id,
    method,
    ...(params ? { params } : {}),
  }, session);

  if (parsed.status >= 400 || parsed?.envelope?.error) {
    throw new Error(errorMessage(connector, method, parsed));
  }

  return isPlainObject(parsed?.envelope?.result) ? parsed.envelope.result : {};
}

async function sendNotification(connector, method, session, params) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    await fetch(connector.url, {
      method: "POST",
      headers: buildHeaders(session.protocolVersion, session.sessionId, true),
      body: JSON.stringify({
        jsonrpc: "2.0",
        method,
        ...(params ? { params } : {}),
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function closeRemoteSession(connector, sessionId) {
  if (!sessionId) {
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      await fetch(connector.url, {
        method: "DELETE",
        headers: buildHeaders(undefined, sessionId, false),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // best effort
  }
}

function cloneSessionRecord(record) {
  return {
    sessionId: record.sessionId,
    protocolVersion: record.protocolVersion,
    connector: {
      ...record.connector,
    },
    serverInfo: record.serverInfo ? { ...record.serverInfo } : undefined,
    serverCapabilities: isPlainObject(record.serverCapabilities)
      ? JSON.parse(JSON.stringify(record.serverCapabilities))
      : {},
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normalizeConnector(connector) {
  if (!isPlainObject(connector)) {
    throw new Error("Connector record is required");
  }

  const id = typeof connector.id === "string" ? connector.id.trim() : "";
  const name = typeof connector.name === "string" ? connector.name.trim() : "";
  const url = typeof connector.url === "string" ? connector.url.trim() : "";

  if (!id || !name || !url) {
    throw new Error("Connector must include id, name, and url");
  }

  return {
    id,
    name,
    title: typeof connector.title === "string" ? connector.title.trim() : undefined,
    url,
    isBuiltIn: connector.isBuiltIn === true,
    builtInAppId: typeof connector.builtInAppId === "string" ? connector.builtInAppId.trim() : undefined,
    builtInKind: typeof connector.builtInKind === "string" ? connector.builtInKind.trim() : undefined,
    autoOpenOnExec: connector.autoOpenOnExec === true,
    resourceUri: typeof connector.resourceUri === "string" ? connector.resourceUri.trim() : undefined,
  };
}

class McpAppSessionManager {
  constructor() {
    this.sessions = new Map();
    this.activeConnectorSessions = new Map();
  }

  _getSessionRecord(sessionId) {
    const normalizedSessionId = String(sessionId || "").trim();
    const record = this.sessions.get(normalizedSessionId);
    if (!record) {
      throw new Error("MCP app session not found");
    }
    return record;
  }

  getSession(sessionId) {
    const record = this.sessions.get(String(sessionId || "").trim());
    return record ? cloneSessionRecord(record) : null;
  }

  getActiveSessionForConnector(connectorId) {
    const activeSessionId = this.activeConnectorSessions.get(String(connectorId || "").trim());
    return activeSessionId ? this.getSession(activeSessionId) : null;
  }

  async openSession(rawConnector, options = {}) {
    const connector = normalizeConnector(rawConnector);
    const existingSessionId = this.activeConnectorSessions.get(connector.id);
    if (existingSessionId) {
      const existing = this.sessions.get(existingSessionId);
      if (existing) {
        existing.updatedAt = new Date().toISOString();
        return cloneSessionRecord(existing);
      }
    }

    if (options.replaceExisting !== false && existingSessionId) {
      await this.closeSession(existingSessionId);
    }

    const parsed = await sendRpcRequest(connector, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: DEFAULT_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: CLIENT_INFO,
      },
    }, {
      protocolVersion: DEFAULT_PROTOCOL_VERSION,
    });

    if (parsed.status >= 400) {
      throw new Error(
        parsed.status === 404 || parsed.status === 405
          ? `${connector.name} does not accept MCP Streamable HTTP initialization at ${connector.url}.`
          : errorMessage(connector, "initialize", parsed),
      );
    }

    const result = parsed?.envelope?.result;
    if (!isPlainObject(result)) {
      throw new Error(`${connector.name} returned an invalid initialize response.`);
    }

    const protocolVersion = typeof result.protocolVersion === "string" && result.protocolVersion.trim()
      ? result.protocolVersion.trim()
      : DEFAULT_PROTOCOL_VERSION;

    const record = {
      sessionId: parsed.sessionId,
      protocolVersion,
      connector,
      serverInfo: isPlainObject(result.serverInfo) ? {
        name: typeof result.serverInfo.name === "string" ? result.serverInfo.name : undefined,
        version: typeof result.serverInfo.version === "string" ? result.serverInfo.version : undefined,
        title: typeof result.serverInfo.title === "string" ? result.serverInfo.title : undefined,
        description: typeof result.serverInfo.description === "string" ? result.serverInfo.description : undefined,
      } : undefined,
      serverCapabilities: isPlainObject(result.capabilities) ? result.capabilities : {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await sendNotification(connector, "notifications/initialized", record);
    this.sessions.set(record.sessionId, record);
    this.activeConnectorSessions.set(connector.id, record.sessionId);
    return cloneSessionRecord(record);
  }

  async listResources(sessionId, cursor) {
    const session = this._getSessionRecord(sessionId);
    const result = await sendSessionRequest(
      session.connector,
      session,
      11,
      "resources/list",
      cursor ? { cursor } : undefined,
    );
    session.updatedAt = new Date().toISOString();
    return result;
  }

  async listResourceTemplates(sessionId, cursor) {
    const session = this._getSessionRecord(sessionId);
    const result = await sendSessionRequest(
      session.connector,
      session,
      12,
      "resources/templates/list",
      cursor ? { cursor } : undefined,
    );
    session.updatedAt = new Date().toISOString();
    return result;
  }

  async readResource(sessionId, uri) {
    const session = this._getSessionRecord(sessionId);
    const result = await sendSessionRequest(session.connector, session, 20, "resources/read", { uri });
    session.updatedAt = new Date().toISOString();
    return result;
  }

  async callTool(sessionId, name, args = {}) {
    const session = this._getSessionRecord(sessionId);
    const result = await sendSessionRequest(session.connector, session, 30, "tools/call", {
      name,
      arguments: isPlainObject(args) ? args : {},
    });
    session.updatedAt = new Date().toISOString();
    return result;
  }

  async sendUiMessage(sessionId, params = {}) {
    const session = this._getSessionRecord(sessionId);
    const result = await sendSessionRequest(session.connector, session, 40, "ui/message", params);
    session.updatedAt = new Date().toISOString();
    return result;
  }

  async closeSession(sessionId) {
    const normalizedSessionId = String(sessionId || "").trim();
    const session = this.sessions.get(normalizedSessionId);
    if (!session) {
      return { success: true };
    }

    this.sessions.delete(normalizedSessionId);
    // #region agent log
    fetch("http://127.0.0.1:7547/ingest/445f944e-452a-47ad-a4e0-f4df5fd886e1", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "182468" }, body: JSON.stringify({ sessionId: "182468", location: "mcp-app-session-manager.js:closeSession", message: "closeSession removed session", data: { hypothesisId: "H2", closedId: normalizedSessionId, keysNow: Array.from(this.sessions.keys()) }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
    if (this.activeConnectorSessions.get(session.connector.id) === normalizedSessionId) {
      this.activeConnectorSessions.delete(session.connector.id);
    }

    await closeRemoteSession(session.connector, session.sessionId);
    return { success: true };
  }

  async closeConnectorSession(connectorId) {
    const activeSessionId = this.activeConnectorSessions.get(String(connectorId || "").trim());
    if (!activeSessionId) {
      return { success: true };
    }
    return await this.closeSession(activeSessionId);
  }

  async closeAll() {
    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map((sessionId) => this.closeSession(sessionId)));
    return { success: true };
  }

  /** @returns {string[]} */
  debugListSessionIds() {
    return Array.from(this.sessions.keys());
  }
}

module.exports = {
  CLIENT_INFO,
  DEFAULT_PROTOCOL_VERSION,
  McpAppSessionManager,
};
