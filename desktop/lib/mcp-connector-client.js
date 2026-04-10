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

function sanitizeUnknown(value, depth = 0) {
  if (depth > 8) {
    return undefined;
  }

  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeUnknown(entry, depth + 1))
      .filter((entry) => entry !== undefined);
  }

  if (isPlainObject(value)) {
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
      const sanitized = sanitizeUnknown(entry, depth + 1);
      if (sanitized !== undefined) {
        next[key] = sanitized;
      }
    }
    return next;
  }

  return undefined;
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

function errorMessage(url, method, parsed) {
  if (parsed?.envelope?.error?.message) {
    return `${method} failed for ${url}: ${parsed.envelope.error.message}`;
  }
  return `${method} failed for ${url} with HTTP ${parsed?.status ?? "unknown"}`;
}

async function sendRpcRequest(url, request, session) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
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

async function sendNotification(url, method, session) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    await fetch(url, {
      method: "POST",
      headers: buildHeaders(session.protocolVersion, session.sessionId, true),
      body: JSON.stringify({
        jsonrpc: "2.0",
        method,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function closeSession(url, sessionId) {
  if (!sessionId) {
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      await fetch(url, {
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

async function openSession(url) {
  const parsed = await sendRpcRequest(url, {
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
        ? `This endpoint does not accept MCP Streamable HTTP initialization: ${url}`
        : errorMessage(url, "initialize", parsed),
    );
  }

  const result = parsed?.envelope?.result;
  if (!isPlainObject(result)) {
    throw new Error(`Invalid initialize response from ${url}`);
  }

  const protocolVersion = typeof result.protocolVersion === "string" && result.protocolVersion.trim()
    ? result.protocolVersion.trim()
    : DEFAULT_PROTOCOL_VERSION;

  const session = {
    protocolVersion,
    sessionId: parsed.sessionId,
    serverInfo: isPlainObject(result.serverInfo) ? {
      name: typeof result.serverInfo.name === "string" ? result.serverInfo.name : undefined,
      version: typeof result.serverInfo.version === "string" ? result.serverInfo.version : undefined,
      title: typeof result.serverInfo.title === "string" ? result.serverInfo.title : undefined,
      description: typeof result.serverInfo.description === "string" ? result.serverInfo.description : undefined,
    } : undefined,
    serverCapabilities: isPlainObject(result.capabilities) ? result.capabilities : {},
  };

  await sendNotification(url, "notifications/initialized", session);
  return session;
}

async function withSession(url, handler) {
  const session = await openSession(url);
  try {
    return await handler(session);
  } finally {
    await closeSession(url, session.sessionId);
  }
}

function sanitizeTool(raw) {
  if (!isPlainObject(raw) || typeof raw.name !== "string" || !raw.name.trim()) {
    return null;
  }

  return {
    name: raw.name.trim(),
    title: typeof raw.title === "string" ? raw.title.trim() : undefined,
    description: typeof raw.description === "string" ? raw.description.trim() : undefined,
    inputSchema: isPlainObject(raw.inputSchema) ? raw.inputSchema : undefined,
    annotations: isPlainObject(raw.annotations) ? raw.annotations : undefined,
    _meta: isPlainObject(raw._meta) ? sanitizeUnknown(raw._meta) : undefined,
  };
}

function sanitizeResource(raw) {
  if (!isPlainObject(raw) || typeof raw.uri !== "string" || !raw.uri.trim()) {
    return null;
  }

  return {
    uri: raw.uri.trim(),
    name: typeof raw.name === "string" ? raw.name.trim() : undefined,
    title: typeof raw.title === "string" ? raw.title.trim() : undefined,
    description: typeof raw.description === "string" ? raw.description.trim() : undefined,
    mimeType: typeof raw.mimeType === "string" ? raw.mimeType.trim() : undefined,
    size: typeof raw.size === "number" ? raw.size : undefined,
    _meta: isPlainObject(raw._meta) ? sanitizeUnknown(raw._meta) : undefined,
  };
}

function sanitizeResourceTemplate(raw) {
  if (!isPlainObject(raw) || typeof raw.uriTemplate !== "string" || !raw.uriTemplate.trim()) {
    return null;
  }

  return {
    uriTemplate: raw.uriTemplate.trim(),
    name: typeof raw.name === "string" ? raw.name.trim() : undefined,
    title: typeof raw.title === "string" ? raw.title.trim() : undefined,
    description: typeof raw.description === "string" ? raw.description.trim() : undefined,
    mimeType: typeof raw.mimeType === "string" ? raw.mimeType.trim() : undefined,
    _meta: isPlainObject(raw._meta) ? sanitizeUnknown(raw._meta) : undefined,
  };
}

async function sendSessionRequest(url, session, id, method, params) {
  const parsed = await sendRpcRequest(url, {
    jsonrpc: "2.0",
    id,
    method,
    ...(params ? { params } : {}),
  }, session);

  if (parsed.status >= 400 || parsed?.envelope?.error) {
    throw new Error(errorMessage(url, method, parsed));
  }

  return isPlainObject(parsed?.envelope?.result) ? parsed.envelope.result : {};
}

async function listPaginated(url, session, method, resultKey) {
  const results = [];
  let cursor;
  let requestId = 10;

  while (true) {
    let payload;
    try {
      payload = await sendSessionRequest(
        url,
        session,
        requestId,
        method,
        cursor ? { cursor } : undefined,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/method not found/i.test(message) || /-32601/.test(message)) {
        return results;
      }
      throw error;
    }

    const entries = Array.isArray(payload[resultKey]) ? payload[resultKey] : [];
    results.push(...entries);
    requestId += 1;

    if (typeof payload.nextCursor !== "string" || !payload.nextCursor.trim()) {
      break;
    }
    cursor = payload.nextCursor;
  }

  return results;
}

async function discoverConnector(url) {
  return await withSession(url, async (session) => {
    const tools = session.serverCapabilities?.tools
      ? (await listPaginated(url, session, "tools/list", "tools"))
        .map((entry) => sanitizeTool(entry))
        .filter(Boolean)
      : [];

    const resources = session.serverCapabilities?.resources
      ? (await listPaginated(url, session, "resources/list", "resources"))
        .map((entry) => sanitizeResource(entry))
        .filter(Boolean)
      : [];

    const resourceTemplates = session.serverCapabilities?.resources
      ? (await listPaginated(url, session, "resources/templates/list", "resourceTemplates"))
        .map((entry) => sanitizeResourceTemplate(entry))
        .filter(Boolean)
      : [];

    return {
      transport: "streamable-http",
      protocolVersion: session.protocolVersion,
      serverInfo: session.serverInfo,
      serverCapabilities: session.serverCapabilities,
      tools,
      resources,
      resourceTemplates,
      checkedAt: new Date().toISOString(),
    };
  });
}

module.exports = {
  discoverConnector,
};
