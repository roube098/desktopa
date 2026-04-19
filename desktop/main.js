for (const stream of [process.stdout, process.stderr]) {
  if (stream && typeof stream.on === "function") {
    stream.on("error", (err) => {
      if (err && err.code === "EPIPE") return;
      throw err;
    });
  }
}

const { app, BrowserWindow, WebContentsView, ipcMain, shell, session, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const crypto = require("crypto");
const { exec } = require("child_process");
const DockerManager = require("./lib/docker-manager");
const TrayManager = require("./lib/tray-manager");
const providerStore = require("./lib/provider-store");
const runtimeConfigStore = require("./lib/runtime-config-store");
const { McpAppSessionManager } = require("./lib/mcp-app-session-manager");
const { pluginManager } = require("./lib/plugin-manager");
const { skillsManager } = require("./lib/skills-manager");
const { SkillsWatcher } = require("./lib/skills-watcher");
const ExcelorRuntime = require("./lib/excelor-runtime");
const { resolveExcelorRuntimePaths } = require("./lib/excelor-runtime-paths");
const {
  normalizeFormat,
  resolveFormatSelection,
  buildDeterministicFileName,
  resolveUniqueFilePath,
} = require("./lib/onlyoffice-file-policy");
const {
  parseGatewayIps,
  pickIpv4DirectoryNames,
  mergeClientDirectoryNames,
  buildClientDirs,
  findFirstExistingFilePath,
  findFirstTemplatePath,
} = require("./lib/onlyoffice-example-paths");
const {
  buildOnlyOfficeEditorUrl,
  rewriteOnlyOfficeServiceUrls,
  injectOnlyOfficeEditorBootstrap,
  isOnlyOfficeEditorRequest,
} = require("./lib/onlyoffice-editor-bridge");

const pdfParse = require("pdf-parse");

// Avoid Windows white-screen compositor failures on some Electron/GPU setups.
app.disableHardwareAcceleration();

const ROOT = path.resolve(__dirname, "..");
const WORKSPACE_DIR = path.join(require("os").homedir(), "Documents", "My Workspace");
const ONLYOFFICE_EXAMPLE_FILES_ROOT = path.join(
  ROOT,
  "onlyoffice-data",
  "lib",
  "documentserver-example",
  "files",
);
const ONLYOFFICE_CONTAINER_NAME = "spreadsheet-ai-onlyoffice";
const ONLYOFFICE_CONTAINER_EXAMPLE_FILES_ROOT = "/var/lib/onlyoffice/documentserver-example/files";
const ONLYOFFICE_LEGACY_CLIENT_DIR = "172.19.0.1";
const ONLYOFFICE_CLIENT_PATH_CACHE_TTL_MS = 30_000;
const INITIAL_BROWSER_URL = "about:blank";

/** Wait until the Vite dev server accepts HTTP (avoids a blank window when Electron wins the startup race). */
function waitForDevServer(devUrl, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(devUrl);
    } catch (err) {
      reject(err);
      return;
    }
    const deadline = Date.now() + timeoutMs;
    const poll = () => {
      if (Date.now() >= deadline) {
        reject(new Error(`Timed out waiting for dev server at ${devUrl}`));
        return;
      }
      const req = http.get(
        {
          hostname: u.hostname,
          port: u.port || (u.protocol === "https:" ? 443 : 80),
          path: u.pathname || "/",
        },
        (res) => {
          res.resume();
          resolve();
        },
      );
      req.on("error", () => {
        setTimeout(poll, 300);
      });
      req.setTimeout(2500, () => {
        req.destroy();
        setTimeout(poll, 300);
      });
    };
    poll();
  });
}
const HIDDEN_BOUNDS = { x: -10000, y: -10000, width: 1, height: 1 };
const ONLYOFFICE_WORKSPACE_EXTS = new Set([
  ".xlsx",
  ".xls",
  ".docx",
  ".doc",
  ".pptx",
  ".ppt",
  ".pdf",
  ".csv",
  ".md",
  ".txt",
]);

let mainWindow = null;
let skillsWatcher = null;
let docker = null;
let tray = null;
let browserView = null;
let browserBounds = { ...HIDDEN_BOUNDS };
let browserVisible = false;
const EXCELOR_SCOPES = ["main", "onlyoffice"];
const EXCELOR_SCOPE_PORTS = {
  main: parseInt(process.env.EXCELOR_MAIN_PORT ?? "27182", 10),
  onlyoffice: parseInt(process.env.EXCELOR_ONLYOFFICE_PORT ?? "27183", 10),
};
const MCP_APP_DEFAULT_TITLE = "tldraw Canvas";
let excelorRuntimes = {};
let excelorContexts = {
  main: {
    documentContext: "spreadsheet",
    editorLoaded: false,
    editorUrl: "",
    activeFileName: "",
    activeWorkspacePath: "",
    mcpAppContext: null,
  },
  onlyoffice: {
    documentContext: "spreadsheet",
    editorLoaded: false,
    editorUrl: "",
    activeFileName: "",
    activeWorkspacePath: "",
    mcpAppContext: null,
  },
};
const mcpAppSessionManager = new McpAppSessionManager();
let activeMcpAppState = null;
const readyMcpAppSessions = new Set();
const readyMcpAppWaiters = new Map();
const pendingOnlyOfficeToolRequests = new Map();
let browserBridgeServer = null;
let browserBridgePort = null;
let browserBridgeToken = "";
let browserToolRefs = new Map();
let browserToolTabs = [];
let browserToolActiveTab = -1;
let onlyOfficeClientPathCache = null;
let hasLoggedOnlyOfficeClientPaths = false;
let onlyOfficeEditorInterceptorInstalled = false;
let isRecoveringMainWindow = false;

async function loadMainWindowContent() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (process.env.VITE_DEV_SERVER_URL) {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    try {
      console.log("[electron] Waiting for Vite dev server at", devUrl);
      await waitForDevServer(devUrl);
      console.log("[electron] Dev server reachable, loading renderer.");
    } catch (err) {
      console.error("[electron] Dev server wait failed:", err && err.message ? err.message : err);
    }
    await mainWindow.loadURL(devUrl);
    return;
  }

  await mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));
}

function recoverMainWindow(reason) {
  if (!mainWindow || mainWindow.isDestroyed() || isRecoveringMainWindow) return;
  isRecoveringMainWindow = true;
  console.warn(`[electron] Recovering main window after ${reason}`);
  setTimeout(() => {
    void loadMainWindowContent()
      .catch((error) => {
        console.error("[electron] Main window recovery failed:", error && error.message ? error.message : error);
      })
      .finally(() => {
        isRecoveringMainWindow = false;
      });
  }, 300);
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isVisible()) return;
  mainWindow.show();
  sendBrowserState();
}

function sendExcelorBrowserToolFocus() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("excelor-browser-tool-focus");
}

function sendExcelorBrowserToolRestore() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("excelor-browser-tool-restore");
}

function getBrowserBridgeEnv() {
  if (!browserBridgePort || !browserBridgeToken) return {};
  return {
    EXCELOR_BROWSER_BRIDGE_URL: `http://127.0.0.1:${browserBridgePort}`,
    EXCELOR_BROWSER_BRIDGE_TOKEN: browserBridgeToken,
    EXCELOR_EDITOR_BRIDGE_URL: `http://127.0.0.1:${browserBridgePort}`,
    EXCELOR_EDITOR_BRIDGE_TOKEN: browserBridgeToken,
    EXCELOR_MCP_APP_BRIDGE_URL: `http://127.0.0.1:${browserBridgePort}`,
    EXCELOR_MCP_APP_BRIDGE_TOKEN: browserBridgeToken,
  };
}

const SKILL_PROMPT_TIMEOUT_MS = 15 * 60 * 1000;

function awaitSkillScriptApprovalFromRenderer(win, event) {
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    const channel = `skill:script-approval:response:${requestId}`;
    let settled = false;
    const finish = (approved) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ipcMain.removeListener("skill:script-approval:response", listener);
      resolve(approved === true);
    };
    const listener = (_evt, payload) => {
      if (!payload || payload.requestId !== requestId) return;
      finish(payload.approved === true);
    };
    ipcMain.on("skill:script-approval:response", listener);
    const timer = setTimeout(() => finish(false), SKILL_PROMPT_TIMEOUT_MS);
    try {
      win.webContents.send("skill:script-approval:request", {
        requestId,
        skillName: String(event?.skillName || ""),
        skillPath: String(event?.skillPath || ""),
        transports: Array.isArray(event?.transports) ? event.transports.map(String) : [],
      });
    } catch (_e) {
      finish(false);
    }
  });
}

function awaitSkillEnvSecretFromRenderer(win, event) {
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ipcMain.removeListener("skill:env-secret:response", listener);
      resolve(typeof value === "string" && value.length > 0 ? value : null);
    };
    const listener = (_evt, payload) => {
      if (!payload || payload.requestId !== requestId) return;
      finish(typeof payload.value === "string" ? payload.value : null);
    };
    ipcMain.on("skill:env-secret:response", listener);
    const timer = setTimeout(() => finish(null), SKILL_PROMPT_TIMEOUT_MS);
    try {
      win.webContents.send("skill:env-secret:request", {
        requestId,
        name: String(event?.name || ""),
        description: event?.description ? String(event.description) : "",
        skillName: String(event?.skillName || ""),
      });
    } catch (_e) {
      finish(null);
    }
  });
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const text = Buffer.concat(chunks).toString("utf8").trim();
        resolve(text ? JSON.parse(text) : {});
      } catch (_error) {
        reject(new Error("Invalid JSON payload."));
      }
    });

    req.on("error", reject);
  });
}

function buildDesktopPorts() {
  const dockerPorts = docker ? docker.getPorts() : { backend: 8090, onlyoffice: 8080 };
  return {
    ...dockerPorts,
    editorBridge: browserBridgePort || 0,
  };
}

function writeUpgradeProxyError(socket, statusCode, message) {
  const body = Buffer.from(String(message || "OnlyOffice upgrade proxy failed."), "utf8");
  if (!socket.writable) {
    socket.destroy();
    return;
  }

  socket.write(
    `HTTP/1.1 ${statusCode} ${statusCode === 404 ? "Not Found" : "Bad Gateway"}\r\n` +
    "Connection: close\r\n" +
    "Content-Type: text/plain; charset=utf-8\r\n" +
    `Content-Length: ${body.length}\r\n` +
    "\r\n",
  );
  socket.end(body);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isOnlyOfficeHttpUrl(rawUrl) {
  try {
    const parsed = rawUrl instanceof URL ? rawUrl : new URL(String(rawUrl || ""));
    const onlyofficePort = String(getOnlyOfficePorts().onlyoffice);
    const hostname = String(parsed.hostname || "").toLowerCase();
    return (
      parsed.protocol === "http:" &&
      (hostname === "127.0.0.1" || hostname === "localhost") &&
      String(parsed.port || "80") === onlyofficePort
    );
  } catch (_error) {
    return false;
  }
}

function buildOnlyOfficeEditorErrorResponse(message, status = 502) {
  const errorMessage = String(message || "OnlyOffice editor failed to load.");
  const errorHtml = [
    "<!doctype html>",
    "<html>",
    "<head><meta charset=\"utf-8\"><title>OnlyOffice Error</title></head>",
    "<body style=\"margin:0;font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;\">",
    "  <script>",
    `    window.parent.postMessage({ type: 'onlyoffice-editor-error', message: ${JSON.stringify(errorMessage)} }, '*');`,
    "  </script>",
    `  <div style=\"padding:24px;\"><h1 style=\"margin:0 0 12px;font-size:20px;\">OnlyOffice Error</h1><p style=\"margin:0;font-size:14px;line-height:1.5;\">${escapeHtml(errorMessage)}</p></div>`,
    "</body>",
    "</html>",
  ].join("");

  return new Response(errorHtml, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function resolveOnlyOfficeContainerReachableOrigin() {
  const ports = getOnlyOfficePorts();
  try {
    const resolved = await resolveOnlyOfficeClientPaths();
    const gatewayIp = Array.isArray(resolved.gatewayIps) ? resolved.gatewayIps.find(Boolean) : "";
    if (gatewayIp) {
      return `http://${gatewayIp}:${ports.onlyoffice}`;
    }
  } catch (_error) {
    // Fall through to the Docker host alias.
  }
  return `http://host.docker.internal:${ports.onlyoffice}`;
}

async function installOnlyOfficeEditorInterceptor() {
  if (onlyOfficeEditorInterceptorInstalled) return;

  const defaultSession = session.defaultSession;
  await defaultSession.protocol.handle("http", async (request) => {
    let upstreamResponse;
    try {
      upstreamResponse = await defaultSession.fetch(request, {
        bypassCustomProtocolHandlers: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isOnlyOfficeHttpUrl(request.url)) {
        console.error(`[onlyoffice-editor] upstream request failed for ${request.method || "GET"} ${request.url}: ${message}`);
      }
      return isOnlyOfficeEditorRequest(request.url, { onlyofficePort: getOnlyOfficePorts().onlyoffice })
        ? buildOnlyOfficeEditorErrorResponse(message, 502)
        : new Response(JSON.stringify({ error: message }), {
          status: 502,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
        });
    }

    if (isOnlyOfficeHttpUrl(request.url)) {
      let parsedUrl = null;
      try {
        parsedUrl = new URL(request.url);
      } catch (_error) {
        parsedUrl = null;
      }

      if (parsedUrl && parsedUrl.pathname.startsWith("/example/") && upstreamResponse.status >= 400) {
        console.error(
          `[onlyoffice-editor] upstream example request failed for ${request.method || "GET"} ${parsedUrl.pathname}${parsedUrl.search}: ${upstreamResponse.status}`,
        );
      }
    }

    if (!isOnlyOfficeEditorRequest(request.url, { onlyofficePort: getOnlyOfficePorts().onlyoffice })) {
      return upstreamResponse;
    }

    try {
      const contentType = String(upstreamResponse.headers.get("content-type") || "");
      if (!contentType.includes("text/html")) {
        return buildOnlyOfficeEditorErrorResponse("OnlyOffice editor returned a non-HTML response.", upstreamResponse.status || 502);
      }

      const sourceHtml = await upstreamResponse.text();
      const containerReachableOrigin = await resolveOnlyOfficeContainerReachableOrigin();
      const rewrittenHtml = rewriteOnlyOfficeServiceUrls(sourceHtml, {
        browserOrigins: [
          `http://localhost:${getOnlyOfficePorts().onlyoffice}`,
          `http://127.0.0.1:${getOnlyOfficePorts().onlyoffice}`,
        ],
        containerOrigin: containerReachableOrigin,
      });
      const injectedHtml = injectOnlyOfficeEditorBootstrap(rewrittenHtml);
      if (injectedHtml === rewrittenHtml) {
        console.error(`[onlyoffice-editor] failed to find connectEditor bootstrap marker for ${request.url}`);
        return buildOnlyOfficeEditorErrorResponse("OnlyOffice editor returned an unexpected page.", upstreamResponse.status || 502);
      }
      const headers = new Headers(upstreamResponse.headers);
      headers.delete("content-length");
      headers.delete("content-encoding");

      return new Response(injectedHtml, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[onlyoffice-editor] failed to inject editor bootstrap for ${request.url}: ${message}`);
      return buildOnlyOfficeEditorErrorResponse(message, 502);
    }
  });

  onlyOfficeEditorInterceptorInstalled = true;
}

function normalizeBrowserToolUrl(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if (/^(https?:|file:|about:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function resetBrowserToolState() {
  browserToolRefs = new Map();
  browserToolTabs = [];
  browserToolActiveTab = -1;
}

function getBrowserContentsOrThrow() {
  if (!browserView || browserView.webContents.isDestroyed()) {
    throw new Error("Browser view is not available.");
  }
  return browserView.webContents;
}

function upsertBrowserTab(url, isNewTab) {
  if (!url) return;
  if (isNewTab || browserToolActiveTab < 0) {
    browserToolTabs.push(url);
    browserToolActiveTab = browserToolTabs.length - 1;
    return;
  }
  browserToolTabs[browserToolActiveTab] = url;
}

async function waitForBrowserLoadStop(timeoutMs = 10000) {
  const viewContents = getBrowserContentsOrThrow();
  if (!viewContents.isLoading()) return;

  await new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      viewContents.removeListener("did-stop-loading", onDone);
      viewContents.removeListener("did-fail-load", onDone);
      resolve();
    };
    const onDone = () => cleanup();
    const timer = setTimeout(cleanup, timeoutMs);
    viewContents.once("did-stop-loading", onDone);
    viewContents.once("did-fail-load", onDone);
  });
}

async function buildBrowserSnapshot(maxChars) {
  const viewContents = getBrowserContentsOrThrow();
  const result = await viewContents.executeJavaScript(`
    (() => {
      const maxElements = 200;
      const safeText = (value) => String(value || "").replace(/\\s+/g, " ").trim();
      const isVisible = (el) => {
        if (!(el instanceof Element)) return false;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const esc = (value) => {
        try {
          return CSS.escape(value);
        } catch (_error) {
          return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_");
        }
      };
      const cssPath = (node) => {
        if (!(node instanceof Element)) return "";
        if (node.id) return "#" + esc(node.id);
        const parts = [];
        let current = node;
        while (current && current.nodeType === 1 && parts.length < 8) {
          const tag = current.tagName.toLowerCase();
          let part = tag;
          if (current.classList && current.classList.length > 0) {
            const classes = Array.from(current.classList).slice(0, 2).map(esc).join(".");
            if (classes) part += "." + classes;
          }
          if (current.parentElement) {
            const siblings = Array.from(current.parentElement.children).filter((s) => s.tagName === current.tagName);
            if (siblings.length > 1) {
              part += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
            }
          }
          parts.unshift(part);
          current = current.parentElement;
        }
        return parts.join(" > ");
      };
      const inferRole = (el) => {
        const explicit = safeText(el.getAttribute("role"));
        if (explicit) return explicit.toLowerCase();
        const tag = el.tagName.toLowerCase();
        if (tag === "a") return "link";
        if (tag === "button") return "button";
        if (tag === "input") {
          const type = (el.getAttribute("type") || "text").toLowerCase();
          if (type === "checkbox") return "checkbox";
          if (type === "radio") return "radio";
          return "textbox";
        }
        if (tag === "textarea") return "textbox";
        if (tag === "select") return "combobox";
        return "generic";
      };
      const inferName = (el) =>
        safeText(
          el.getAttribute("aria-label")
          || el.getAttribute("title")
          || el.getAttribute("placeholder")
          || (el.tagName.toLowerCase() === "input" ? el.value : "")
          || el.innerText
          || el.textContent
        );

      const rawCandidates = Array.from(
        document.querySelectorAll("a, button, input, textarea, select, summary, [role], [contenteditable='true'], [tabindex]")
      );
      const lines = [];
      const refs = [];
      const seenSelectors = new Set();
      const title = safeText(document.title);
      lines.push('- page "' + (title || location.href) + '"');

      for (const node of rawCandidates) {
        if (refs.length >= maxElements) break;
        if (!isVisible(node)) continue;
        const selector = cssPath(node);
        if (!selector || seenSelectors.has(selector)) continue;
        seenSelectors.add(selector);
        const ref = "e" + (refs.length + 1);
        const role = inferRole(node);
        const name = inferName(node);
        const href = node.tagName.toLowerCase() === "a" ? safeText(node.href) : "";
        let line = "- " + role;
        if (name) line += ' "' + name.replace(/"/g, "'") + '"';
        line += " [ref=" + ref + "]";
        if (href) line += " /url: " + href;
        lines.push(line);
        refs.push({
          ref,
          selector,
          role,
          name,
          href,
        });
      }

      const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
        .map((el) => safeText(el.textContent))
        .filter(Boolean)
        .slice(0, 5);
      if (headings.length) {
        lines.push("");
        lines.push("headings:");
        for (const heading of headings) {
          lines.push("- " + heading);
        }
      }

      return {
        url: location.href,
        title: document.title || "",
        snapshot: lines.join("\\n"),
        refs,
      };
    })()
  `, true);

  browserToolRefs = new Map((result.refs || []).map((entry) => [entry.ref, entry]));

  const fallbackLimit = 50000;
  const parsedLimit = Number.isFinite(maxChars) ? Math.max(1000, Math.floor(maxChars)) : fallbackLimit;
  let snapshot = String(result.snapshot || "");
  let truncated = false;
  if (snapshot.length > parsedLimit) {
    snapshot = `${snapshot.slice(0, parsedLimit)}\n\n[...TRUNCATED - page too large, use read action for full text]`;
    truncated = true;
  }

  return {
    url: result.url || viewContents.getURL() || "",
    title: result.title || "",
    snapshot,
    truncated,
    refCount: browserToolRefs.size,
    refs: Object.fromEntries([...browserToolRefs.entries()].map(([ref, entry]) => [ref, {
      role: entry.role,
      name: entry.name,
      href: entry.href,
    }])),
    hint: 'Use act with kind="click" and ref="eN" to click elements. Or navigate directly to a /url visible in the snapshot.',
  };
}

async function runBrowserRefScript(ref, scriptFactory) {
  const entry = browserToolRefs.get(ref);
  if (!entry?.selector) {
    return { ok: false, error: `Unknown ref: ${ref}` };
  }

  const viewContents = getBrowserContentsOrThrow();
  const payload = JSON.stringify({ selector: entry.selector });
  return await viewContents.executeJavaScript(`
    (() => {
      const args = ${payload};
      const selector = args.selector;
      const el = document.querySelector(selector);
      if (!el) {
        return { ok: false, error: "Element not found." };
      }
      ${scriptFactory}
    })()
  `, true);
}

async function handleBrowserBridgeAction(payload) {
  const action = String(payload?.action || "").trim();
  if (!action) {
    throw new Error("action is required.");
  }

  if (action !== "close") {
    sendExcelorBrowserToolFocus();
  }

  switch (action) {
    case "navigate":
    case "open": {
      const url = normalizeBrowserToolUrl(payload?.url);
      if (!url) {
        throw new Error(`url is required for ${action} action.`);
      }
      const viewContents = getBrowserContentsOrThrow();
      await viewContents.loadURL(url);
      await waitForBrowserLoadStop(15000);
      upsertBrowserTab(viewContents.getURL(), action === "open");
      return {
        ok: true,
        url: viewContents.getURL() || url,
        title: viewContents.getTitle?.() || "",
        tabIndex: browserToolActiveTab,
        hint: "Page loaded. Call snapshot to see page structure and find elements to interact with.",
      };
    }

    case "snapshot": {
      await waitForBrowserLoadStop(5000);
      return await buildBrowserSnapshot(payload?.maxChars);
    }

    case "act": {
      const request = payload?.request || {};
      const kind = String(request.kind || "").trim();
      if (!kind) {
        throw new Error("request.kind is required for act action.");
      }
      const ref = request.ref ? String(request.ref) : "";

      if (kind === "click") {
        if (!ref) throw new Error("ref is required for click.");
        const result = await runBrowserRefScript(ref, `
          if (el instanceof HTMLElement) {
            el.scrollIntoView({ behavior: "instant", block: "center", inline: "center" });
            el.focus();
            el.click();
            return { ok: true };
          }
          return { ok: false, error: "Target element is not clickable." };
        `);
        if (!result.ok) throw new Error(result.error || "Click failed.");
        await waitForBrowserLoadStop(10000);
        return { ok: true, clicked: ref, hint: "Click successful. Call snapshot to see the updated page." };
      }

      if (kind === "type") {
        const text = String(request.text || "");
        if (!ref) throw new Error("ref is required for type.");
        if (!text) throw new Error("text is required for type.");
        const payloadText = JSON.stringify({ text });
        const result = await runBrowserRefScript(ref, `
          const typed = ${payloadText}.text;
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            el.focus();
            el.value = typed;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            return { ok: true };
          }
          if (el instanceof HTMLElement && el.isContentEditable) {
            el.focus();
            el.textContent = typed;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            return { ok: true };
          }
          return { ok: false, error: "Target element does not support typing." };
        `);
        if (!result.ok) throw new Error(result.error || "Type failed.");
        return { ok: true, ref, typed: text };
      }

      if (kind === "press") {
        const key = String(request.key || "");
        if (!key) throw new Error("key is required for press.");
        const viewContents = getBrowserContentsOrThrow();
        viewContents.sendInputEvent({ type: "keyDown", keyCode: key });
        if (key.length === 1) {
          viewContents.sendInputEvent({ type: "char", keyCode: key });
        }
        viewContents.sendInputEvent({ type: "keyUp", keyCode: key });
        await waitForBrowserLoadStop(5000);
        return { ok: true, pressed: key };
      }

      if (kind === "hover") {
        if (!ref) throw new Error("ref is required for hover.");
        const result = await runBrowserRefScript(ref, `
          if (el instanceof HTMLElement) {
            const over = new MouseEvent("mouseover", { bubbles: true, cancelable: true });
            const enter = new MouseEvent("mouseenter", { bubbles: true, cancelable: true });
            el.dispatchEvent(over);
            el.dispatchEvent(enter);
            return { ok: true };
          }
          return { ok: false, error: "Target element is not hoverable." };
        `);
        if (!result.ok) throw new Error(result.error || "Hover failed.");
        return { ok: true, hovered: ref };
      }

      if (kind === "scroll") {
        const direction = String(request.direction || "down").toLowerCase() === "up" ? "up" : "down";
        const delta = direction === "down" ? 500 : -500;
        const viewContents = getBrowserContentsOrThrow();
        await viewContents.executeJavaScript(`window.scrollBy(0, ${delta}); true;`, true);
        await new Promise((resolve) => setTimeout(resolve, 300));
        return { ok: true, scrolled: direction };
      }

      if (kind === "wait") {
        const waitTime = Math.min(Math.max(Number(request.timeMs) || 2000, 0), 10000);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return { ok: true, waited: waitTime };
      }

      throw new Error(`Unknown act kind: ${kind}`);
    }

    case "read": {
      await waitForBrowserLoadStop(5000);
      const viewContents = getBrowserContentsOrThrow();
      const content = await viewContents.executeJavaScript(`
        (() => {
          const main = document.querySelector("main, article, [role='main'], .content, #content");
          const target = main || document.body;
          return (target && target.innerText) ? target.innerText : "";
        })()
      `, true);
      return {
        url: viewContents.getURL() || "",
        title: viewContents.getTitle?.() || "",
        content: String(content || ""),
      };
    }

    case "close": {
      resetBrowserToolState();
      try {
        const viewContents = getBrowserContentsOrThrow();
        await viewContents.loadURL(INITIAL_BROWSER_URL);
      } catch (_error) {
        // Keep close idempotent even if the view is not currently available.
      }
      sendExcelorBrowserToolRestore();
      return { ok: true, message: "Browser closed" };
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function startBrowserBridge() {
  if (browserBridgeServer) return;

  browserBridgeToken = crypto.randomBytes(24).toString("hex");

  browserBridgeServer = http.createServer(async (req, res) => {
    const method = req.method || "";
    const url = new URL(req.url || "/", "http://127.0.0.1");

    if (method === "POST" && url.pathname === "/browser/action") {
      const token = req.headers["x-excelor-browser-token"];
      if (token !== browserBridgeToken) {
        writeJson(res, 401, { error: "Unauthorized browser bridge request." });
        return;
      }

      try {
        const payload = await readJsonBody(req);
        const result = await handleBrowserBridgeAction(payload);
        writeJson(res, 200, result);
      } catch (error) {
        writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (method === "POST" && url.pathname === "/editor/tool") {
      const token = req.headers["x-excelor-editor-token"];
      if (token !== browserBridgeToken) {
        writeJson(res, 401, { error: "Unauthorized editor bridge request." });
        return;
      }

      try {
        const payload = await readJsonBody(req);
        const scope = normalizeExcelorScope(payload?.scope || "main");
        const contextType = String(payload?.contextType || "").trim();
        const toolName = String(payload?.toolName || "").trim();
        const args = payload?.args && typeof payload.args === "object" ? payload.args : {};

        if (!contextType || !toolName) {
          writeJson(res, 400, {
            success: false,
            message: "contextType and toolName are required.",
          });
          return;
        }

        const generationTool = toolName === "createFile" || toolName === "exportCurrentFile";
        const result = generationTool
          ? await handleOnlyOfficeGenerationTool(toolName, args, scope)
          : await invokeOnlyOfficeTool({
            scope,
            contextType,
            toolName,
            args,
          });
        writeJson(res, 200, result || { success: false, message: "Editor bridge returned no result." });
      } catch (error) {
        writeJson(res, 400, { success: false, message: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (method === "POST" && url.pathname === "/mcp-app/tool") {
      const token = req.headers["x-excelor-mcp-app-token"];
      if (token !== browserBridgeToken) {
        writeJson(res, 401, { error: "Unauthorized MCP app bridge request." });
        return;
      }

      try {
        const payload = await readJsonBody(req);
        const connectorId = normalizeText(payload?.connectorId);
        const toolName = normalizeText(payload?.toolName);
        const args = isPlainObject(payload?.args) ? payload.args : {};
        const connector = findMcpConnector(connectorId);

        if (!connector || connector.isEnabled === false) {
          writeJson(res, 404, { error: "MCP connector not found or disabled." });
          return;
        }

        if (!toolName) {
          writeJson(res, 400, { error: "toolName is required." });
          return;
        }

        const sessionInfo = await mcpAppSessionManager.openSession(connector);
        // #region agent log
        fetch("http://127.0.0.1:7547/ingest/445f944e-452a-47ad-a4e0-f4df5fd886e1", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "182468" }, body: JSON.stringify({ sessionId: "182468", location: "main.js:bridge-mcp-app-tool", message: "openSession completed for tool", data: { hypothesisId: "H4", bridgeSessionId: sessionInfo && sessionInfo.sessionId, connectorId: connector.id, toolName, keysAfterOpen: mcpAppSessionManager.debugListSessionIds() }, timestamp: Date.now() }) }).catch(() => {});
        // #endregion
        const invocationId = `mcp-app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        let result;

        if (normalizeText(connector.builtInAppId) === "tldraw" && toolName === "exec") {
          setActiveMcpAppState(
            buildPendingMcpAppState(payload?.scope || "main", connector, sessionInfo, toolName, args, invocationId, {
              pending: true,
              dispatchToolInput: false,
            }),
          );
          await waitForMcpAppSessionReady(sessionInfo.sessionId);
          const resultPromise = mcpAppSessionManager.callTool(sessionInfo.sessionId, toolName, args);
          setActiveMcpAppState(
            buildPendingMcpAppState(payload?.scope || "main", connector, sessionInfo, toolName, args, invocationId, {
              pending: true,
              dispatchToolInput: true,
            }),
          );
          result = await resultPromise;
        } else {
          result = await mcpAppSessionManager.callTool(sessionInfo.sessionId, toolName, args);
        }

        writeJson(res, 200, {
          success: true,
          result,
          appSession: {
            sessionId: sessionInfo.sessionId,
            connectorId: connector.id,
            connectorName: connector.name,
            connectorTitle: connector.title || connector.name,
            resourceUri: findConnectorToolResourceUri(connector, toolName),
            builtInAppId: connector.builtInAppId,
            invocationId,
          },
        });
      } catch (error) {
        writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    writeJson(res, 404, { error: "Not found." });
  });

  browserBridgeServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    console.error(`[browser-bridge] rejected upgrade for ${url.pathname}`);
    void head;
    writeUpgradeProxyError(socket, 404, "Browser bridge routes do not support websocket upgrades.");
  });

  await new Promise((resolve, reject) => {
    browserBridgeServer.once("error", reject);
    browserBridgeServer.listen(0, "127.0.0.1", () => {
      const address = browserBridgeServer.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to resolve browser bridge address."));
        return;
      }
      browserBridgePort = address.port;
      browserBridgeServer.removeListener("error", reject);
      resolve();
    });
  });

  console.log(`[excelor-browser-bridge] listening on http://127.0.0.1:${browserBridgePort}`);
}

async function stopBrowserBridge() {
  if (!browserBridgeServer) return;
  await new Promise((resolve) => {
    browserBridgeServer.close(() => resolve());
  });
  browserBridgeServer = null;
  browserBridgePort = null;
  browserBridgeToken = "";
  resetBrowserToolState();
}

function sendBrowserState() {
  if (!mainWindow || mainWindow.isDestroyed() || !browserView) return;

  const viewContents = browserView.webContents;
  mainWindow.webContents.send("browser-state-changed", {
    url: viewContents.getURL() || "",
    isLoading: viewContents.isLoading(),
    canGoBack: viewContents.canGoBack(),
    canGoForward: viewContents.canGoForward(),
  });
}

function applyBrowserBounds() {
  if (!browserView) return;

  const nextBounds = browserVisible && browserBounds.width > 0 && browserBounds.height > 0
    ? browserBounds
    : HIDDEN_BOUNDS;

  browserView.setBounds(nextBounds);
}

function navigateBrowser(url) {
  if (!browserView || !url) return;

  browserView.webContents.loadURL(url).catch((err) => {
    console.error("Failed to navigate browser view:", err);
  });
}

function loadInitialBrowserPage() {
  if (!browserView) return;

  browserView.webContents.loadURL(INITIAL_BROWSER_URL).catch((err) => {
    console.error("Failed to initialize browser view:", err);
  });
}

function normalizeExcelorScope(rawScope) {
  const scope = String(rawScope || "").trim().toLowerCase();
  return EXCELOR_SCOPES.includes(scope) ? scope : "main";
}

function getExcelorRuntime(scope = "main") {
  const normalizedScope = normalizeExcelorScope(scope);
  return excelorRuntimes[normalizedScope] || null;
}

function getExcelorContext(scope = "main") {
  const normalizedScope = normalizeExcelorScope(scope);
  return excelorContexts[normalizedScope] || excelorContexts.main;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function extractTextContentBlocks(content) {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((entry) => (
      isPlainObject(entry) && entry.type === "text" && typeof entry.text === "string"
        ? entry.text.trim()
        : ""
    ))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function summarizeMcpAppContent(content, maxLength = 600) {
  const text = extractTextContentBlocks(content);
  if (!text) {
    return "";
  }

  return text.length > maxLength
    ? `${text.slice(0, maxLength - 1)}...`
    : text;
}

function getConnectorToolUiResourceUri(tool) {
  if (!isPlainObject(tool)) {
    return "";
  }

  const nestedMeta = isPlainObject(tool._meta) && isPlainObject(tool._meta.ui)
    ? tool._meta.ui
    : null;
  if (nestedMeta && typeof nestedMeta.resourceUri === "string" && nestedMeta.resourceUri.trim()) {
    return nestedMeta.resourceUri.trim();
  }

  return "";
}

function findMcpConnector(connectorId) {
  return runtimeConfigStore.getMcpConnectors()
    .find((connector) => connector.id === connectorId) || null;
}

function findConnectorToolResourceUri(connector, toolName) {
  const tools = Array.isArray(connector?.discovery?.tools) ? connector.discovery.tools : [];
  const match = tools.find((tool) => normalizeText(tool?.name) === normalizeText(toolName));
  return (
    getConnectorToolUiResourceUri(match)
    || normalizeText(connector?.resourceUri)
    || ""
  );
}

function buildMcpAppDesktopContext(state) {
  if (!state) {
    return null;
  }

  const modelContext = isPlainObject(state.modelContext) ? state.modelContext : {};
  const structuredContent = isPlainObject(modelContext.structuredContent)
    ? modelContext.structuredContent
    : isPlainObject(state.toolResult?.structuredContent)
      ? state.toolResult.structuredContent
      : {};
  const shapeCount = Array.isArray(structuredContent.shapes)
    ? structuredContent.shapes.length
    : undefined;
  const summaryText = (
    summarizeMcpAppContent(modelContext.content)
    || summarizeMcpAppContent(state.toolResult?.content)
  );

  return {
    appId: normalizeText(state.builtInAppId),
    connectorId: normalizeText(state.connectorId),
    connectorName: normalizeText(state.connectorName),
    title: normalizeText(state.title),
    sessionId: normalizeText(state.sessionId),
    resourceUri: normalizeText(state.resourceUri),
    canvasId: normalizeText(
      structuredContent.canvasId
      || state.toolResult?.structuredContent?.canvasId
      || state.toolArguments?.canvasId,
    ) || undefined,
    checkpointId: normalizeText(
      structuredContent.checkpointId
      || state.toolResult?.structuredContent?.checkpointId,
    ) || undefined,
    summaryText: summaryText || undefined,
    shapeCount: Number.isFinite(shapeCount) ? shapeCount : undefined,
    updatedAt: state.updatedAt,
  };
}

function syncActiveMcpAppDesktopContext() {
  const nextContexts = { ...excelorContexts };
  for (const scope of EXCELOR_SCOPES) {
    nextContexts[scope] = {
      ...getExcelorContext(scope),
      mcpAppContext: activeMcpAppState && activeMcpAppState.scope === scope
        ? buildMcpAppDesktopContext(activeMcpAppState)
        : null,
    };
  }
  excelorContexts = nextContexts;

  for (const scope of EXCELOR_SCOPES) {
    const runtime = getExcelorRuntime(scope);
    if (runtime) {
      emitExcelorSnapshot(scope, runtime.getSnapshot());
    }
  }
}

function emitMcpAppState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("mcp-app-state-changed", activeMcpAppState);
}

function markMcpAppSessionReady(sessionId) {
  const normalizedSessionId = normalizeText(sessionId);
  if (!normalizedSessionId) {
    return;
  }

  readyMcpAppSessions.add(normalizedSessionId);
  const waiters = readyMcpAppWaiters.get(normalizedSessionId) || [];
  readyMcpAppWaiters.delete(normalizedSessionId);
  for (const waiter of waiters) {
    clearTimeout(waiter.timeoutId);
    try {
      waiter.resolve();
    } catch (_error) {
      // Ignore waiter resolution failures.
    }
  }
}

function clearMcpAppSessionReady(sessionId) {
  const normalizedSessionId = normalizeText(sessionId);
  if (!normalizedSessionId) {
    return;
  }

  readyMcpAppSessions.delete(normalizedSessionId);
  const waiters = readyMcpAppWaiters.get(normalizedSessionId) || [];
  readyMcpAppWaiters.delete(normalizedSessionId);
  for (const waiter of waiters) {
    clearTimeout(waiter.timeoutId);
    try {
      waiter.reject(new Error(`MCP app session '${normalizedSessionId}' was cleared before it became ready.`));
    } catch (_error) {
      // Ignore waiter rejection failures.
    }
  }
}

async function waitForMcpAppSessionReady(sessionId, timeoutMs = 15000) {
  const normalizedSessionId = normalizeText(sessionId);
  if (!normalizedSessionId) {
    throw new Error("MCP app session id is required.");
  }

  if (readyMcpAppSessions.has(normalizedSessionId)) {
    return;
  }

  await new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const waiters = readyMcpAppWaiters.get(normalizedSessionId) || [];
      readyMcpAppWaiters.set(
        normalizedSessionId,
        waiters.filter((entry) => entry.resolve !== resolve),
      );
      reject(new Error(`Timed out waiting for MCP app session '${normalizedSessionId}' to become ready.`));
    }, timeoutMs);

    const waiters = readyMcpAppWaiters.get(normalizedSessionId) || [];
    readyMcpAppWaiters.set(normalizedSessionId, [
      ...waiters,
      { resolve, reject, timeoutId },
    ]);
  });
}

function setActiveMcpAppState(nextState) {
  const previousSessionId = normalizeText(activeMcpAppState?.sessionId);
  const nextSessionId = normalizeText(nextState?.sessionId);
  if (nextSessionId && previousSessionId !== nextSessionId) {
    clearMcpAppSessionReady(nextSessionId);
  }
  activeMcpAppState = nextState
    ? {
        ...nextState,
        invocationId: normalizeText(nextState.invocationId),
        pending: nextState.pending === true,
        dispatchToolInput: nextState.dispatchToolInput === true,
        toolArguments: isPlainObject(nextState.toolArguments) ? nextState.toolArguments : {},
        toolResult: isPlainObject(nextState.toolResult) ? {
          ...nextState.toolResult,
          content: Array.isArray(nextState.toolResult.content) ? nextState.toolResult.content : [],
        } : {
          content: [],
          structuredContent: undefined,
          meta: undefined,
        },
      }
    : null;
  syncActiveMcpAppDesktopContext();
  emitMcpAppState();
}

function clearActiveMcpAppState(sessionId = "") {
  if (!activeMcpAppState) {
    return;
  }
  if (sessionId && normalizeText(activeMcpAppState.sessionId) !== normalizeText(sessionId)) {
    return;
  }
  clearMcpAppSessionReady(activeMcpAppState.sessionId);
  setActiveMcpAppState(null);
}

function buildPendingMcpAppState(scope, connector, sessionInfo, toolName, toolArguments, invocationId, options = {}) {
  const existingState = activeMcpAppState && normalizeText(activeMcpAppState.sessionId) === normalizeText(sessionInfo?.sessionId)
    ? activeMcpAppState
    : null;
  const title = normalizeText(
    sessionInfo?.serverInfo?.title
    || connector?.title
    || connector?.name,
  ) || MCP_APP_DEFAULT_TITLE;

  return {
    scope: normalizeExcelorScope(scope),
    sessionId: normalizeText(sessionInfo?.sessionId),
    connectorId: normalizeText(connector?.id),
    connectorName: normalizeText(connector?.name || "MCP App"),
    connectorTitle: normalizeText(connector?.title || connector?.name || title),
    resourceUri: normalizeText(findConnectorToolResourceUri(connector, toolName) || connector?.resourceUri),
    builtInAppId: normalizeText(connector?.builtInAppId),
    title,
    toolName: normalizeText(toolName),
    toolArguments: isPlainObject(toolArguments) ? toolArguments : {},
    toolResult: existingState?.toolResult || {
      content: [],
      structuredContent: undefined,
      meta: undefined,
    },
    modelContext: existingState?.modelContext || null,
    invocationId: normalizeText(invocationId),
    pending: options.pending !== false,
    dispatchToolInput: options.dispatchToolInput === true,
    updatedAt: new Date().toISOString(),
  };
}

function buildMcpAppStateFromToolPayload(scope, payload) {
  const connector = isPlainObject(payload?.connector) ? payload.connector : {};
  const appSession = isPlainObject(payload?.appSession) ? payload.appSession : {};
  const sessionId = normalizeText(appSession.sessionId);
  const resourceUri = normalizeText(appSession.resourceUri);
  if (!sessionId || !resourceUri) {
    return null;
  }

  const existingState = activeMcpAppState && normalizeText(activeMcpAppState.sessionId) === sessionId
    ? activeMcpAppState
    : null;
  const title = normalizeText(
    appSession.title
    || appSession.connectorTitle
    || connector.title
    || connector.name,
  ) || MCP_APP_DEFAULT_TITLE;

  return {
    scope: normalizeExcelorScope(scope),
    sessionId,
    connectorId: normalizeText(appSession.connectorId || connector.id),
    connectorName: normalizeText(appSession.connectorName || connector.name || "MCP App"),
    connectorTitle: normalizeText(appSession.connectorTitle || connector.title || connector.name || title),
    resourceUri,
    builtInAppId: normalizeText(appSession.builtInAppId || connector.builtInAppId),
    title,
    toolName: normalizeText(payload.remoteToolName || payload.toolName),
    toolArguments: isPlainObject(payload.toolArguments) ? payload.toolArguments : {},
    toolResult: {
      content: Array.isArray(payload.content) ? payload.content : [],
      structuredContent: payload.structuredContent,
      meta: isPlainObject(payload.meta) ? payload.meta : undefined,
    },
    modelContext: existingState?.modelContext || null,
    invocationId: normalizeText(appSession.invocationId || existingState?.invocationId),
    pending: false,
    dispatchToolInput: false,
    updatedAt: new Date().toISOString(),
  };
}

function handleRuntimeMcpAppToolResult(scope, payload) {
  const nextState = buildMcpAppStateFromToolPayload(scope, payload);
  if (!nextState) {
    return;
  }

  if (normalizeText(nextState.builtInAppId) !== "tldraw") {
    return;
  }

  setActiveMcpAppState(nextState);
  // #region agent log
  fetch("http://127.0.0.1:7547/ingest/445f944e-452a-47ad-a4e0-f4df5fd886e1", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "182468" }, body: JSON.stringify({ sessionId: "182468", location: "main.js:handleRuntimeMcpAppToolResult", message: "dexter runtime set tldraw mcp state", data: { hypothesisId: "H5", emittedSessionId: normalizeText(nextState.sessionId), knownSessionIds: mcpAppSessionManager.debugListSessionIds(), hasEmittedInMap: mcpAppSessionManager.getSession(nextState.sessionId) != null }, timestamp: Date.now() }) }).catch(() => {});
  // #endregion
}

function extractMcpAppMessageText(content) {
  return extractTextContentBlocks(content);
}

function normalizeApprovedSkillProposalPayload(rawPayload) {
  const payload = rawPayload && typeof rawPayload === "object" ? rawPayload : {};
  const action = String(payload.action || "").trim().toLowerCase();
  const proposalId = String(payload.proposalId || "").trim();
  const name = String(payload.name || "").trim();
  const description = String(payload.description || "").trim();
  const body = String(payload.body || "").trim();

  if (action !== "create" && action !== "update") {
    throw new Error("Skill approval action must be create or update.");
  }
  if (!proposalId) {
    throw new Error("Skill approval requires a proposalId.");
  }
  if (!name || !description || !body) {
    throw new Error("Skill approval requires name, description, and body.");
  }

  const normalized = {
    proposalId,
    action,
    name,
    description,
    body,
  };

  if (action === "update") {
    const skillNameToUpdate = String(payload.skillNameToUpdate || "").trim();
    if (!skillNameToUpdate) {
      throw new Error("Skill approval updates require skillNameToUpdate.");
    }
    normalized.skillNameToUpdate = skillNameToUpdate;
  }

  return normalized;
}

function normalizePlanApprovalPayload(rawPayload) {
  const payload = rawPayload && typeof rawPayload === "object" ? rawPayload : {};
  const proposalId = String(payload.proposalId || "").trim();
  const planId = String(payload.planId || "").trim();
  const title = String(payload.title || "").trim();
  const summary = String(payload.summary || "").trim();
  const body = String(payload.body || "").trim();
  const revision = Number.isFinite(payload.revision) ? Number(payload.revision) : 0;

  if (!proposalId || !planId || !title || !summary || !body) {
    throw new Error("Plan approval requires proposalId, planId, title, summary, and body.");
  }

  return {
    proposalId,
    planId,
    title,
    summary,
    body,
    revision,
    draftPath: String(payload.draftPath || "").trim() || undefined,
  };
}

function normalizePlanRevisionPayload(rawPayload) {
  const payload = rawPayload && typeof rawPayload === "object" ? rawPayload : {};
  const proposalId = String(payload.proposalId || "").trim();
  const note = String(payload.note || "").trim();

  if (!proposalId || !note) {
    throw new Error("Plan revision requires proposalId and note.");
  }

  return { proposalId, note };
}

function normalizePlanRejectionPayload(rawPayload) {
  const payload = rawPayload && typeof rawPayload === "object" ? rawPayload : {};
  const proposalId = String(payload.proposalId || "").trim();

  if (!proposalId) {
    throw new Error("Plan rejection requires a proposalId.");
  }

  return { proposalId };
}

async function approveSkillProposalViaServer(payload, scope = "main") {
  const normalizedScope = normalizeExcelorScope(scope);
  const port = EXCELOR_SCOPE_PORTS[normalizedScope] || EXCELOR_SCOPE_PORTS.main;
  const response = await fetch(`http://localhost:${port}/skills/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let result = null;
  try {
    result = await response.json();
  } catch (_error) {
    result = null;
  }

  if (!result || typeof result !== "object") {
    return {
      ok: false,
      error: `Skill approval endpoint returned ${response.status}.`,
      skillsChanged: false,
    };
  }

  return result;
}

function updateActiveEditorFileContext(filePath, editorUrl = "") {
  const normalizedPath = typeof filePath === "string" && filePath.trim()
    ? path.resolve(filePath)
    : "";
  const activeFileName = normalizedPath ? path.basename(normalizedPath) : "";

  const nextContexts = { ...excelorContexts };
  for (const scope of EXCELOR_SCOPES) {
    nextContexts[scope] = {
      ...getExcelorContext(scope),
      activeFileName,
      activeWorkspacePath: normalizedPath,
      ...(editorUrl ? { editorUrl } : {}),
    };
  }
  excelorContexts = nextContexts;
}

function getEnabledSkillNames() {
  try {
    const skills = skillsManager.getSkillRuntimeConfig();
    return skills
      .filter((skill) => skill.isEnabled && !skill.isHidden)
      .map((skill) => skill.name)
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

async function refreshExcelorPluginRuntimes() {
  const runtimes = Object.values(excelorRuntimes || {}).filter(Boolean);
  await Promise.all(
    runtimes.map((runtime) =>
      typeof runtime.refreshPlugins === "function"
        ? runtime.refreshPlugins().catch(() => null)
        : Promise.resolve(null),
    ),
  );
}

function emitExcelorSnapshot(scope, snapshot) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const normalizedScope = normalizeExcelorScope(scope);
  mainWindow.webContents.send("excelor-snapshot", {
    ...snapshot,
    scope: normalizedScope,
  });
}

function emitWorkspaceFilesChanged(payload = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const workspacePath = typeof payload.workspacePath === "string" ? path.resolve(payload.workspacePath) : "";
  const relativePath = workspacePath && isPathInsideDirectory(WORKSPACE_DIR, workspacePath)
    ? getRelativeWorkspacePath(workspacePath)
    : "";
  const fileName = typeof payload.fileName === "string" && payload.fileName.trim()
    ? payload.fileName
    : workspacePath
      ? path.basename(workspacePath)
      : "";

  mainWindow.webContents.send("workspace-files-changed", {
    reason: String(payload.reason || "updated"),
    fileName,
    workspacePath: workspacePath || "",
    relativePath: relativePath || "",
    updatedAt: new Date().toISOString(),
  });
}

function sendExcelorCloseRequested() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("excelor-close-requested");
}

function toSafeFileName(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return "";

  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch (_error) {
    decoded = value;
  }
  return path.basename(decoded);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCommand(command) {
  return await new Promise((resolve, reject) => {
    exec(command, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
        return;
      }
      resolve(stdout);
    });
  });
}

async function ensureWorkspaceDir() {
  await fs.promises.mkdir(WORKSPACE_DIR, { recursive: true });
}

async function resolveOnlyOfficeClientPaths() {
  const now = Date.now();
  if (
    onlyOfficeClientPathCache &&
    Array.isArray(onlyOfficeClientPathCache.clientDirNames) &&
    onlyOfficeClientPathCache.expiresAt > now
  ) {
    return onlyOfficeClientPathCache;
  }

  const discoveredHostDirNames = [];
  try {
    const entries = fs.readdirSync(ONLYOFFICE_EXAMPLE_FILES_ROOT, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      discoveredHostDirNames.push(entry.name);
    }
  } catch (_error) {
    // Ignore missing host storage and continue with gateway/legacy fallbacks.
  }

  let gatewayIps = [];
  try {
    const gatewayOutput = await runCommand(
      `docker inspect ${ONLYOFFICE_CONTAINER_NAME} --format "{{range .NetworkSettings.Networks}}{{.Gateway}} {{end}}"`,
    );
    gatewayIps = parseGatewayIps(gatewayOutput);
  } catch (_error) {
    // Continue without gateway hints; discovered directories and legacy fallback still apply.
  }

  const clientDirNames = mergeClientDirectoryNames({
    gatewayIps,
    discoveredDirNames: pickIpv4DirectoryNames(discoveredHostDirNames),
    legacyDirName: ONLYOFFICE_LEGACY_CLIENT_DIR,
  });
  const hostDirs = buildClientDirs(ONLYOFFICE_EXAMPLE_FILES_ROOT, clientDirNames, path);
  const containerDirs = buildClientDirs(ONLYOFFICE_CONTAINER_EXAMPLE_FILES_ROOT, clientDirNames, path.posix);
  const result = {
    gatewayIps,
    discoveredDirNames: pickIpv4DirectoryNames(discoveredHostDirNames),
    clientDirNames,
    hostDirs,
    containerDirs,
    expiresAt: now + ONLYOFFICE_CLIENT_PATH_CACHE_TTL_MS,
  };

  onlyOfficeClientPathCache = result;

  if (!hasLoggedOnlyOfficeClientPaths) {
    hasLoggedOnlyOfficeClientPaths = true;
    console.info(
      `[OnlyOffice] Resolved example storage dirs: gateways=${result.gatewayIps.join(",") || "none"}; clients=${result.clientDirNames.join(",") || "none"}`,
    );
  }

  return result;
}

async function findOnlyOfficeStoredFilePath(fileName) {
  const safeName = toSafeFileName(fileName);
  if (!safeName) {
    return { filePath: "", searchedDirs: [] };
  }
  const resolved = await resolveOnlyOfficeClientPaths();
  const filePath = findFirstExistingFilePath(safeName, resolved.hostDirs, fs);
  return {
    filePath,
    searchedDirs: resolved.hostDirs,
  };
}

function normalizePathForComparison(value) {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function isPathInsideDirectory(parentDir, targetPath) {
  const parent = normalizePathForComparison(path.resolve(parentDir));
  const target = normalizePathForComparison(path.resolve(targetPath));
  const parentWithSep = parent.endsWith(path.sep) ? parent : `${parent}${path.sep}`;
  return target === parent || target.startsWith(parentWithSep);
}

function getRelativeWorkspacePath(filePath) {
  return path.relative(WORKSPACE_DIR, filePath).split(path.sep).join("/");
}

async function listWorkspaceFilesRecursive() {
  const queue = [WORKSPACE_DIR];
  const files = [];

  while (queue.length > 0) {
    const currentDir = queue.pop();
    let entries = [];
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch (_error) {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;

      let stat = null;
      try {
        stat = await fs.promises.stat(fullPath);
      } catch (_error) {
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase().replace(/^\./, "");
      files.push({
        name: entry.name,
        ext,
        path: fullPath,
        size: stat.size,
        relativePath: getRelativeWorkspacePath(fullPath),
      });
    }
  }

  files.sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: "base" }),
  );

  return files;
}

function getOnlyOfficePorts() {
  return docker ? docker.getPorts() : { onlyoffice: 8080 };
}

function buildEditorUrl(fileName) {
  const ports = getOnlyOfficePorts();
  return buildOnlyOfficeEditorUrl(`http://localhost:${ports.onlyoffice}`, { fileName });
}

async function copyWorkspaceFileToOnlyOffice(filePath) {
  const fileName = path.basename(filePath);
  const resolved = await resolveOnlyOfficeClientPaths();

  const attemptedDirs = [];
  const copiedToDirs = [];
  const failures = [];

  for (const containerDir of resolved.containerDirs) {
    attemptedDirs.push(containerDir);
    try {
      await runCommand(`docker exec ${ONLYOFFICE_CONTAINER_NAME} mkdir -p "${containerDir}"`);
      await runCommand(`docker cp "${filePath}" ${ONLYOFFICE_CONTAINER_NAME}:"${containerDir}/${fileName}"`);
      copiedToDirs.push(containerDir);
    } catch (error) {
      failures.push({ dir: containerDir, message: error.message || String(error) });
    }
  }

  if (copiedToDirs.length === 0) {
    const firstFailure = failures[0]?.message || "Unknown copy failure.";
    throw new Error(
      `Failed to stage '${fileName}' in OnlyOffice storage. Attempted directories: ${attemptedDirs.join(", ") || "none"}. First error: ${firstFailure}`,
    );
  }

  return { fileName, copiedToDirs, attemptedDirs };
}

async function openWorkspaceFileInEditor(filePath) {
  const copied = await copyWorkspaceFileToOnlyOffice(filePath);
  const fileName = copied.fileName;
  const editorUrl = buildEditorUrl(fileName);
  updateActiveEditorFileContext(filePath, editorUrl);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("navigate-editor", editorUrl);
  }
  return { fileName, editorUrl };
}

async function openGeneratedPptxInOnlyOffice(filePath) {
  await ensureWorkspaceDir();

  const targetPath = path.resolve(String(filePath || ""));
  if (!isPathInsideDirectory(WORKSPACE_DIR, targetPath)) {
    throw new Error("Invalid workspace path.");
  }

  const stat = await fs.promises.stat(targetPath);
  if (!stat.isFile()) {
    throw new Error("The selected path is not a file.");
  }

  if (path.extname(targetPath).toLowerCase() !== ".pptx") {
    throw new Error("Only generated .pptx files can be auto-opened.");
  }

  return await openWorkspaceFileInEditor(targetPath);
}

async function findTemplatePath(format) {
  const normalized = normalizeFormat(format);
  if (!normalized) {
    return { filePath: "", searchedDirs: [] };
  }
  const resolved = await resolveOnlyOfficeClientPaths();
  const filePath = findFirstTemplatePath(normalized, resolved.hostDirs, fs);
  return {
    filePath,
    searchedDirs: resolved.hostDirs,
  };
}

function getCurrentEditorFileName(scope = "onlyoffice") {
  const context = getExcelorContext(scope);
  const editorUrl = String(context.editorUrl || "").trim();
  if (!editorUrl) return "";

  try {
    const parsed = new URL(editorUrl);
    const name = parsed.searchParams.get("fileName");
    return toSafeFileName(name);
  } catch (_error) {
    return "";
  }
}

async function convertOnlyOfficeFileToFormat(sourceFileName, targetFormat, lang = "en") {
  const ports = getOnlyOfficePorts();
  const endpoint = `http://localhost:${ports.onlyoffice}/example/convert`;

  for (let attempt = 0; attempt < 90; attempt += 1) {
    const body = new URLSearchParams({
      filename: sourceFileName,
      fileExt: targetFormat,
      keepOriginal: "true",
      lang,
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: body.toString(),
    });

    const raw = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch (_error) {
      payload = null;
    }
    if (!payload) {
      throw new Error(`Conversion returned invalid JSON: ${raw.slice(0, 200)}`);
    }

    if (payload.error && !payload.filename && typeof payload.step === "undefined") {
      throw new Error(`OnlyOffice conversion failed: ${payload.error}`);
    }

    if (typeof payload.step === "number" && payload.step < 100) {
      await sleep(1000);
      continue;
    }

    if (payload.filename) {
      return toSafeFileName(payload.filename);
    }

    if (payload.error) {
      throw new Error(`OnlyOffice conversion failed: ${payload.error}`);
    }
    await sleep(1000);
  }

  throw new Error("OnlyOffice conversion timed out.");
}

async function handleCreateFileTool(args, scope = "onlyoffice") {
  const selection = resolveFormatSelection({
    requestedFormat: args?.format,
    prompt: args?.prompt,
    title: args?.title,
    mode: "create",
  });

  if (selection.requiresClarification) {
    return {
      success: false,
      message: selection.message,
      data: {
        requiresClarification: true,
      },
    };
  }

  const format = selection.format;
  const hasActiveEditorFile = Boolean(getCurrentEditorFileName(scope));
  const confirmed = args?.confirm === true;
  if (!hasActiveEditorFile && !confirmed) {
    return {
      success: false,
      message: `No file is currently open. Confirm creation before I create and open a new .${format} file.`,
      data: {
        requiresConfirmation: true,
        action: "createFile",
        format,
        title: String(args?.title || args?.prompt || "").trim() || null,
      },
    };
  }

  await ensureWorkspaceDir();

  const templateLookup = await findTemplatePath(format);
  const templatePath = templateLookup.filePath;
  if (!templatePath) {
    return {
      success: false,
      message: `No template file found for .${format} in OnlyOffice example storage. Searched: ${templateLookup.searchedDirs.join(", ") || "none"}.`,
    };
  }

  const deterministicName = buildDeterministicFileName({
    title: args?.title || args?.prompt || "",
    format,
  });
  const destinationPath = resolveUniqueFilePath(
    WORKSPACE_DIR,
    deterministicName,
    (candidate) => fs.existsSync(candidate),
  );

  await fs.promises.copyFile(templatePath, destinationPath);

  const openRequested = args?.open !== false;
  let editorUrl = "";
  if (openRequested) {
    const opened = await openWorkspaceFileInEditor(destinationPath);
    editorUrl = opened.editorUrl;
  }

  emitWorkspaceFilesChanged({
    reason: "created",
    fileName: path.basename(destinationPath),
    workspacePath: destinationPath,
  });

  return {
    success: true,
    message: `Created ${path.basename(destinationPath)} in My Workspace.`,
    data: {
      format,
      fileName: path.basename(destinationPath),
      workspacePath: destinationPath,
      editorUrl,
      templateOnly: true,
    },
  };
}

async function handleExportCurrentFileTool(args, scope = "onlyoffice") {
  const selection = resolveFormatSelection({
    requestedFormat: args?.targetFormat || args?.format,
    prompt: args?.prompt,
    title: args?.title,
    mode: "export",
    defaultFormat: "pdf",
  });

  if (selection.requiresClarification) {
    return {
      success: false,
      message: selection.message,
      data: {
        requiresClarification: true,
      },
    };
  }

  const targetFormat = selection.format;
  if (targetFormat !== "pdf") {
    return {
      success: false,
      message: "Only PDF export is supported right now. Use targetFormat='pdf'.",
    };
  }

  const explicitFileName = toSafeFileName(args?.fileName);
  const sourceFileName = explicitFileName || getCurrentEditorFileName(scope);
  if (!sourceFileName) {
    return {
      success: false,
      message: "No active editor file detected. Open a document and try export again.",
    };
  }

  const sourceFormat = normalizeFormat(path.extname(sourceFileName).slice(1));
  let convertedFileName = sourceFileName;
  if (sourceFormat !== "pdf") {
    convertedFileName = await convertOnlyOfficeFileToFormat(sourceFileName, "pdf", String(args?.lang || "en"));
  }

  const convertedLookup = await findOnlyOfficeStoredFilePath(convertedFileName);
  const convertedPath = convertedLookup.filePath;
  if (!convertedPath) {
    return {
      success: false,
      message: `Converted file not found in OnlyOffice storage: ${convertedFileName}. Searched: ${convertedLookup.searchedDirs.join(", ") || "none"}.`,
    };
  }

  await ensureWorkspaceDir();

  const fallbackTitle = path.basename(sourceFileName, path.extname(sourceFileName));
  const deterministicName = buildDeterministicFileName({
    title: args?.title || `${fallbackTitle}-export`,
    format: "pdf",
  });
  const destinationPath = resolveUniqueFilePath(
    WORKSPACE_DIR,
    deterministicName,
    (candidate) => fs.existsSync(candidate),
  );

  await fs.promises.copyFile(convertedPath, destinationPath);

  const openRequested = args?.open === true;
  let editorUrl = "";
  if (openRequested) {
    const opened = await openWorkspaceFileInEditor(destinationPath);
    editorUrl = opened.editorUrl;
  }

  emitWorkspaceFilesChanged({
    reason: "exported",
    fileName: path.basename(destinationPath),
    workspacePath: destinationPath,
  });

  return {
    success: true,
    message: `Exported ${sourceFileName} to ${path.basename(destinationPath)}.`,
    data: {
      sourceFileName,
      fileName: path.basename(destinationPath),
      workspacePath: destinationPath,
      editorUrl,
    },
  };
}

async function handleOnlyOfficeGenerationTool(toolName, args, scope = "onlyoffice") {
  if (toolName === "createFile") {
    return await handleCreateFileTool(args || {}, scope);
  }
  if (toolName === "exportCurrentFile") {
    return await handleExportCurrentFileTool(args || {}, scope);
  }
  return {
    success: false,
    message: `Unsupported generation tool: ${toolName}`,
  };
}

async function invokeOnlyOfficeTool(request) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { success: false, message: "Main window is not available." };
  }

  if (String(request?.contextType || "").trim() === "presentation") {
    return {
      success: false,
      message: "The legacy OnlyOffice presentation automation bridge has been removed. Use Dexter PowerPoint tools to generate and edit decks.",
    };
  }

  const requestId = `excelor-tool-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  return await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingOnlyOfficeToolRequests.delete(requestId);
      resolve({ success: false, message: "Timed out waiting for the editor bridge." });
    }, 12000);

    pendingOnlyOfficeToolRequests.set(requestId, {
      resolve,
      timeout,
    });

    mainWindow.webContents.send("excelor-apply-subagent-tool", {
      requestId,
      scope: normalizeExcelorScope(request?.scope),
      ...request,
    });
  });
}

function isOnlyOfficeUrl(url) {
  const ooPorts = docker ? docker.getPorts() : { onlyoffice: 8080 };
  return (
    url.includes(`localhost:${ooPorts.onlyoffice}`) ||
    url.includes(`127.0.0.1:${ooPorts.onlyoffice}`)
  );
}

function createBrowserView() {
  browserView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, "browser-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.contentView.addChildView(browserView);
  applyBrowserBounds();

  const viewContents = browserView.webContents;

  viewContents.setWindowOpenHandler(({ url }) => {
    if (isOnlyOfficeUrl(url)) {
      mainWindow.webContents.send("navigate-editor", url);
      return { action: "deny" };
    }

    navigateBrowser(url);
    return { action: "deny" };
  });

  viewContents.on("did-start-loading", sendBrowserState);
  viewContents.on("did-stop-loading", sendBrowserState);
  viewContents.on("did-navigate", sendBrowserState);
  viewContents.on("did-navigate-in-page", sendBrowserState);
  viewContents.on("page-title-updated", sendBrowserState);
  viewContents.on("render-process-gone", sendBrowserState);

  loadInitialBrowserPage();
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#0d1117",
    icon: path.join(__dirname, "assets", "icon.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.webContents.on("dom-ready", () => {
    console.log("[electron] Main window DOM ready");
  });

  mainWindow.webContents.on("did-finish-load", () => {
    console.log("[electron] Main window finished load:", mainWindow.webContents.getURL());
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error(
      `[electron] Main window did-fail-load code=${errorCode} mainFrame=${isMainFrame} url=${validatedURL} error=${errorDescription}`,
    );
    if (isMainFrame && errorCode !== -3) {
      recoverMainWindow(`did-fail-load (${errorCode})`);
    }
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[electron] Main window render-process-gone:", details);
    recoverMainWindow(`render-process-gone (${details?.reason || "unknown"})`);
  });

  mainWindow.webContents.on("unresponsive", () => {
    console.warn("[electron] Main window became unresponsive");
  });

  mainWindow.webContents.on("responsive", () => {
    console.log("[electron] Main window became responsive again");
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level <= 1) {
      console.error(`[renderer:${level}] ${sourceId}:${line} ${message}`);
    }
  });

  await loadMainWindowContent();

  createBrowserView();

  mainWindow.once("ready-to-show", showMainWindow);
  setTimeout(showMainWindow, 50);

  mainWindow.on("resize", applyBrowserBounds);
  mainWindow.on("maximize", applyBrowserBounds);
  mainWindow.on("unmaximize", applyBrowserBounds);

  mainWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isOnlyOfficeUrl(url)) {
      mainWindow.webContents.send("navigate-editor", url);
      return { action: "deny" };
    }

    shell.openExternal(url);
    return { action: "deny" };
  });

  const HIDE_LOGO_CSS = `
    .brand-logo, #header-logo, .logo, .asc-head-logo,
    [id*="toolbar-logo"], [class*="brand"],
    .toolbar .logo img, .logo-placeholder,
    a[href*="onlyoffice.com"].logo,
    #id-toolbar-full .ribtabs > ul > li:first-child[style*="background"],
    .brand.toolbar-logo, .toolbar-logo {
      display: none !important;
      visibility: hidden !important;
      width: 0 !important;
      overflow: hidden !important;
    }
    [data-tab="ai"], li[data-tab="ai"],
    .ribtab[data-tab="ai"],
    #toolbar-ai, #panel-ai,
    .tab-ai, [class*="tab-ai"],
    li.ribtab:has(> a[data-tab="ai"]),
    li.ribtab:last-child {
      display: none !important;
    }
  `;

  mainWindow.webContents.on("did-frame-finish-load", () => {
    try {
      const frames = mainWindow.webContents.mainFrame.framesInSubtree;
      for (const frame of frames) {
        if (frame.url && frame.url.includes("localhost")) {
          frame.executeJavaScript(`
            (function() {
              if (document.getElementById('custom-hide-logo')) return;
              const s = document.createElement('style');
              s.id = 'custom-hide-logo';
              s.textContent = ${JSON.stringify(HIDE_LOGO_CSS)};
              document.head.appendChild(s);
            })();
          `).catch(() => { });
        }
      }
    } catch (_) { }
  });
}

function initExcelorRuntimes() {
  const runtimePaths = resolveExcelorRuntimePaths({
    appIsPackaged: app.isPackaged,
    mainDir: __dirname,
    resourcesPath: process.resourcesPath,
  });
  const transcriptRootDir = path.join(app.getPath("home"), ".excelor", "transcripts");

  excelorRuntimes = {};
  for (const scope of EXCELOR_SCOPES) {
    const runtime = new ExcelorRuntime({
      rootDir: runtimePaths.rootDir,
      excelorDir: runtimePaths.excelorDir,
      bundledBunPath: runtimePaths.bundledBunPath,
      port: EXCELOR_SCOPE_PORTS[scope],
      transcriptPath: path.join(transcriptRootDir, "desktop", scope, "current-thread.json"),
      getContext: () => ({ ...getExcelorContext(scope) }),
      getExecutionConfig: () => {
        const executionConfig = providerStore.getExcelorExecutionConfig();
        if (!executionConfig?.ok) {
          throw new Error(executionConfig?.error || "Excelor could not prepare the active provider.");
        }

        const enabledSkills = getEnabledSkillNames();
        const enabledPlugins = pluginManager.getEnabledPluginNames();
        const skillsEnv = {
          EXCELOR_SKILLS_MODE: "enabled-only",
          EXCELOR_ENABLED_SKILLS: JSON.stringify(enabledSkills),
        };
        const pluginsEnv = {
          EXCELOR_ENABLED_PLUGINS: JSON.stringify(enabledPlugins),
          EXCELOR_PLUGIN_PATHS: JSON.stringify(pluginManager.getExternalPaths()),
        };

        return {
          ...executionConfig,
          env: {
            ...(executionConfig.env || {}),
            ...getBrowserBridgeEnv(),
            ...skillsEnv,
            ...pluginsEnv,
            EXCELOR_ROOT_DIR: runtimePaths.rootDir,
            EXCELOR_RUNTIME_SCOPE: scope,
            EXCELOR_RUNTIME_CONFIG_PATH: runtimeConfigStore.STORE_FILE,
            EXCELOR_WORKSPACE_DIR: WORKSPACE_DIR,
            EXCELOR_TRANSCRIPTS_DIR: transcriptRootDir,
          },
        };
      },
      invokeOnlyOfficeTool: (request) => invokeOnlyOfficeTool({ ...request, scope }),
      onOpenGeneratedPptx: (filePath) => openGeneratedPptxInOnlyOffice(filePath),
      onMcpAppToolResult: (payload) => handleRuntimeMcpAppToolResult(scope, payload),
      promptSkillScriptApproval: async (event) => {
        const win = mainWindow;
        if (!win || win.isDestroyed()) {
          return false;
        }
        return awaitSkillScriptApprovalFromRenderer(win, event);
      },
      promptSkillEnvSecret: async (event) => {
        const win = mainWindow;
        if (!win || win.isDestroyed()) {
          return null;
        }
        return awaitSkillEnvSecretFromRenderer(win, event);
      },
    });

    runtime.on("snapshot", (snapshot) => {
      emitExcelorSnapshot(scope, snapshot);
    });
    runtime.on("skills-changed", () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      try {
        skillsManager.getCatalog();
      } catch (_error) {
        // ignore catalog refresh errors
      }
      mainWindow.webContents.send("skills-changed");
    });
    excelorRuntimes[scope] = runtime;
  }
}

async function startServices() {
  docker = new DockerManager(ROOT);

  docker.on("status-changed", (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("service-status", status);
    }
    if (tray) tray.updateStatus(status);
  });

  docker.on("ports-resolved", (ports) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("ports-resolved", { ...ports, editorBridge: browserBridgePort || 0 });
    }
  });

  docker.on("ready", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("services-ready");
    }
  });

  docker.on("error", (err) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("service-error", err.message || String(err));
    }
  });

  await docker.start();
}

function setupIPC() {
  ipcMain.handle("get-status", () => {
    return docker ? docker.getStatus() : { backend: "stopped", onlyoffice: "stopped" };
  });

  ipcMain.handle("get-ports", () => {
    return buildDesktopPorts();
  });

  ipcMain.handle("restart-services", async () => {
    if (docker) {
      await docker.stop();
      await docker.start();
    }
  });

  ipcMain.handle("browser-show", (_event, bounds) => {
    browserBounds = {
      x: Math.max(0, Math.round(bounds?.x || 0)),
      y: Math.max(0, Math.round(bounds?.y || 0)),
      width: Math.max(0, Math.round(bounds?.width || 0)),
      height: Math.max(0, Math.round(bounds?.height || 0)),
    };
    browserVisible = true;
    applyBrowserBounds();
    sendBrowserState();
    return { success: true };
  });

  ipcMain.handle("browser-hide", () => {
    browserVisible = false;
    applyBrowserBounds();
    return { success: true };
  });

  ipcMain.handle("browser-navigate", (_event, url) => {
    navigateBrowser(url);
    return { success: true };
  });

  ipcMain.handle("browser-load-excelor", () => {
    loadInitialBrowserPage();
    return { success: true };
  });

  ipcMain.handle("browser-go-back", () => {
    if (browserView && browserView.webContents.canGoBack()) {
      browserView.webContents.goBack();
    }
    return { success: true };
  });

  ipcMain.handle("browser-go-forward", () => {
    if (browserView && browserView.webContents.canGoForward()) {
      browserView.webContents.goForward();
    }
    return { success: true };
  });

  ipcMain.handle("browser-reload", () => {
    if (browserView) {
      browserView.webContents.reload();
    }
    return { success: true };
  });

  ipcMain.handle("browser-stop", () => {
    if (browserView && browserView.webContents.isLoading()) {
      browserView.webContents.stop();
    }
    return { success: true };
  });

  ipcMain.handle("browser-open-external", (_event, url) => {
    if (url) {
      shell.openExternal(url);
    }
    return { success: true };
  });

  // Open any local PDF in ONLYOFFICE (stages file into Document Server storage)
  ipcMain.handle("open-pdf-in-onlyoffice", async (_event, filePath) => {
    try {
      const pathString = typeof filePath === "string" ? filePath : (filePath?.path && typeof filePath.path === "string" ? filePath.path : "");
      const targetPath = path.resolve(String(pathString || ""));
      if (!targetPath || !fs.existsSync(targetPath)) {
        return { success: false, error: "PDF file not found." };
      }
      const stat = await fs.promises.stat(targetPath);
      if (!stat.isFile()) {
        return { success: false, error: "Path is not a file." };
      }
      if (path.extname(targetPath).toLowerCase() !== ".pdf") {
        return { success: false, error: "File is not a PDF." };
      }
      const opened = await openWorkspaceFileInEditor(targetPath);
      return { success: true, editorUrl: opened.editorUrl, fileName: opened.fileName };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // PDF text extraction for attachments / agent (by path)
  ipcMain.handle("pdf:extractText", async (_event, filePath) => {
    const pathString = typeof filePath === "string" ? filePath : (filePath?.path && typeof filePath.path === "string" ? filePath.path : "");
    if (!pathString || !fs.existsSync(pathString)) {
      return { error: "PDF file not found" };
    }
    const ext = path.extname(pathString).toLowerCase();
    if (ext !== ".pdf") {
      return { error: "File is not a PDF" };
    }
    try {
      const dataBuffer = fs.readFileSync(pathString);
      const data = await pdfParse(dataBuffer);
      return { text: data.text || "", pageCount: data.numpages };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  // PDF text extraction from buffer (for file picker / drag-drop when no path)
  ipcMain.handle("pdf:extractTextFromBuffer", async (_event, base64) => {
    if (typeof base64 !== "string" || !base64) {
      return { error: "Invalid base64 data" };
    }
    const os = require("os");
    const tmpDir = os.tmpdir();
    const tmpPath = path.join(tmpDir, `excelor-pdf-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.pdf`);
    try {
      const buf = Buffer.from(base64, "base64");
      fs.writeFileSync(tmpPath, buf);
      const data = await pdfParse(buf);
      return { text: data.text || "", pageCount: data.numpages };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    } finally {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch (_) {}
    }
  });

  ipcMain.handle("excelor-bootstrap", (_event, scopeOrPayload) => {
    const scope = normalizeExcelorScope(
      typeof scopeOrPayload === "string"
        ? scopeOrPayload
        : scopeOrPayload?.scope,
    );
    const runtime = getExcelorRuntime(scope);
    if (!runtime) {
      throw new Error(`Excelor runtime for scope '${scope}' is unavailable.`);
    }
    return { ...runtime.getSnapshot(), scope };
  });

  ipcMain.handle("excelor-run-turn", async (_event, inputOrPayload, maybeScope) => {
    const scope = normalizeExcelorScope(
      typeof maybeScope === "string"
        ? maybeScope
        : inputOrPayload?.scope,
    );
    const runtime = getExcelorRuntime(scope);
    if (!runtime) {
      throw new Error(`Excelor runtime for scope '${scope}' is unavailable.`);
    }
    const input = typeof inputOrPayload === "string"
      ? inputOrPayload
      : typeof inputOrPayload?.input === "string"
        ? inputOrPayload.input
        : "";
    const snapshot = await runtime.runTurn(input);
    return { ...snapshot, scope };
  });

  ipcMain.handle("excelor-launch", async (_event, inputOrPayload, maybeScope) => {
    const scope = normalizeExcelorScope(
      typeof maybeScope === "string"
        ? maybeScope
        : inputOrPayload?.scope,
    );
    const runtime = getExcelorRuntime(scope);
    if (!runtime) {
      throw new Error(`Excelor runtime for scope '${scope}' is unavailable.`);
    }
    const input = typeof inputOrPayload === "string"
      ? inputOrPayload
      : typeof inputOrPayload?.input === "string"
        ? inputOrPayload.input
        : "";
    const snapshot = await runtime.launch(input);
    return { ...snapshot, scope };
  });

  ipcMain.handle("excelor-enter-plan-mode", (_event, scopeOrPayload) => {
    const scope = normalizeExcelorScope(
      typeof scopeOrPayload === "string"
        ? scopeOrPayload
        : scopeOrPayload?.scope,
    );
    const runtime = getExcelorRuntime(scope);
    if (!runtime || typeof runtime.enterPlanMode !== "function") {
      throw new Error(`Excelor runtime for scope '${scope}' is unavailable.`);
    }
    const snapshot = runtime.enterPlanMode();
    return { ...snapshot, scope };
  });

  ipcMain.handle("excelor-exit-plan-mode", (_event, scopeOrPayload) => {
    const scope = normalizeExcelorScope(
      typeof scopeOrPayload === "string"
        ? scopeOrPayload
        : scopeOrPayload?.scope,
    );
    const runtime = getExcelorRuntime(scope);
    if (!runtime || typeof runtime.exitPlanMode !== "function") {
      throw new Error(`Excelor runtime for scope '${scope}' is unavailable.`);
    }
    const snapshot = runtime.exitPlanMode();
    return { ...snapshot, scope };
  });

  ipcMain.handle("excelor-abort-turn", async (_event, scopeOrPayload) => {
    const scope = normalizeExcelorScope(
      typeof scopeOrPayload === "string"
        ? scopeOrPayload
        : scopeOrPayload?.scope,
    );
    const runtime = getExcelorRuntime(scope);
    if (!runtime) {
      throw new Error(`Excelor runtime for scope '${scope}' is unavailable.`);
    }
    const reason = typeof scopeOrPayload === "object" && typeof scopeOrPayload?.reason === "string" && scopeOrPayload.reason.trim()
      ? scopeOrPayload.reason.trim()
      : "Excelor timed out after 120 seconds of inactivity.";
    const snapshot = await runtime.abortTurn(reason);
    return { ...snapshot, scope };
  });

  ipcMain.handle("excelor-list-subagents", (_event, scopeOrPayload) => {
    const scope = normalizeExcelorScope(
      typeof scopeOrPayload === "string"
        ? scopeOrPayload
        : scopeOrPayload?.scope,
    );
    const runtime = getExcelorRuntime(scope);
    if (!runtime) {
      throw new Error(`Excelor runtime for scope '${scope}' is unavailable.`);
    }
    return runtime.listSubagents();
  });

  ipcMain.handle("excelor-update-context", async (_event, scopeOrContext, maybeContext) => {
    const scopedCall = typeof scopeOrContext === "string";
    const scope = normalizeExcelorScope(
      scopedCall
        ? scopeOrContext
        : scopeOrContext?.scope,
    );
    const nextContext = scopedCall ? maybeContext : scopeOrContext;
    const currentContext = getExcelorContext(scope);
    excelorContexts = {
      ...excelorContexts,
      [scope]: {
        ...currentContext,
        documentContext: nextContext?.documentContext || currentContext.documentContext,
        editorLoaded: Boolean(nextContext?.editorLoaded),
        editorUrl: typeof nextContext?.editorUrl === "string" ? nextContext.editorUrl : currentContext.editorUrl,
        activeFileName: typeof nextContext?.activeFileName === "string" ? nextContext.activeFileName : currentContext.activeFileName,
        activeWorkspacePath: typeof nextContext?.activeWorkspacePath === "string" ? nextContext.activeWorkspacePath : currentContext.activeWorkspacePath,
      },
    };

    const runtime = getExcelorRuntime(scope);
    if (!runtime) {
      throw new Error(`Excelor runtime for scope '${scope}' is unavailable.`);
    }

    if (nextContext?.resetThread === true && typeof runtime.resetConversation === "function") {
      await runtime.resetConversation();
    }

    const snapshot = runtime.getSnapshot();
    emitExcelorSnapshot(scope, snapshot);
    return { ...snapshot.context, scope };
  });

  ipcMain.handle("get-active-mcp-app", () => {
    return activeMcpAppState;
  });

  ipcMain.handle("mcp-app-open-session", async (_event, connectorId) => {
    const connector = findMcpConnector(connectorId);
    if (!connector || connector.isEnabled === false) {
      throw new Error("MCP connector not found or disabled.");
    }
    return await mcpAppSessionManager.openSession(connector);
  });

  ipcMain.handle("mcp-app-list-resources", async (_event, sessionId, cursor) => {
    return await mcpAppSessionManager.listResources(sessionId, cursor);
  });

  ipcMain.handle("mcp-app-list-resource-templates", async (_event, sessionId, cursor) => {
    return await mcpAppSessionManager.listResourceTemplates(sessionId, cursor);
  });

  ipcMain.handle("mcp-app-read-resource", async (_event, sessionId, uri) => {
    // #region agent log
    const norm = String(sessionId || "").trim();
    const pre = mcpAppSessionManager.getSession(norm);
    const known = mcpAppSessionManager.debugListSessionIds();
    fetch("http://127.0.0.1:7547/ingest/445f944e-452a-47ad-a4e0-f4df5fd886e1", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "182468" }, body: JSON.stringify({ sessionId: "182468", location: "main.js:mcp-app-read-resource", message: "readResource ipc entry", data: { hypothesisId: "H1", requestedSessionId: norm, rawLen: String(sessionId || "").length, hasGetSession: !!pre, knownSessionIds: known, activeMcpSessionId: normalizeText(activeMcpAppState?.sessionId), uriLen: String(uri || "").length }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
    return await mcpAppSessionManager.readResource(sessionId, uri);
  });

  ipcMain.handle("mcp-app-call-tool", async (_event, sessionId, toolName, args) => {
    return await mcpAppSessionManager.callTool(sessionId, toolName, args);
  });

  ipcMain.handle("mcp-app-proxy-ui-message", async (_event, sessionId, params) => {
    return await mcpAppSessionManager.sendUiMessage(sessionId, params);
  });

  ipcMain.handle("mcp-app-handle-message", async (_event, payload) => {
    const scope = normalizeExcelorScope(payload?.scope || activeMcpAppState?.scope || "main");
    const runtime = getExcelorRuntime(scope);
    if (!runtime) {
      return { isError: true, message: `Excelor runtime for scope '${scope}' is unavailable.` };
    }

    const text = extractMcpAppMessageText(payload?.content);
    if (!text) {
      return { isError: true, message: "The MCP app message did not contain any text content." };
    }

    try {
      await runtime.runTurn(text);
      return {};
    } catch (error) {
      return {
        isError: true,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle("mcp-app-update-model-context", async (_event, payload) => {
    const sessionId = normalizeText(payload?.sessionId || activeMcpAppState?.sessionId);
    if (!activeMcpAppState || !sessionId || normalizeText(activeMcpAppState.sessionId) !== sessionId) {
      return { success: false };
    }

    setActiveMcpAppState({
      ...activeMcpAppState,
      modelContext: {
        content: Array.isArray(payload?.content) ? payload.content : [],
        structuredContent: isPlainObject(payload?.structuredContent)
          ? payload.structuredContent
          : undefined,
      },
      updatedAt: new Date().toISOString(),
    });

    return { success: true };
  });

  ipcMain.handle("mcp-app-mark-ready", async (_event, payload) => {
    const sessionId = normalizeText(
      typeof payload === "string"
        ? payload
        : payload?.sessionId || activeMcpAppState?.sessionId,
    );
    if (!sessionId) {
      return { success: false };
    }
    markMcpAppSessionReady(sessionId);
    return { success: true };
  });

  ipcMain.handle("mcp-app-close", async (_event, payload) => {
    const sessionId = normalizeText(
      typeof payload === "string"
        ? payload
        : payload?.sessionId || activeMcpAppState?.sessionId,
    );
    if (!sessionId) {
      clearActiveMcpAppState();
      return { success: true };
    }

    await mcpAppSessionManager.closeSession(sessionId);
    clearActiveMcpAppState(sessionId);
    return { success: true };
  });

  ipcMain.on("minimize-window", () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on("maximize-window", () => {
    if (mainWindow) {
      mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    }
  });

  ipcMain.on("close-window", () => {
    if (mainWindow) mainWindow.hide();
  });

  ipcMain.on("excelor-close", () => {
    sendExcelorCloseRequested();
  });

  ipcMain.on("excelor-subagent-tool-result", (_event, payload) => {
    const pending = pendingOnlyOfficeToolRequests.get(payload?.requestId);
    if (!pending) return;

    clearTimeout(pending.timeout);
    pendingOnlyOfficeToolRequests.delete(payload.requestId);
    pending.resolve(payload.result || { success: false, message: "The editor bridge returned no result." });
  });

  ipcMain.handle("list-workspace-files", async () => {
    try {
      await ensureWorkspaceDir();
      const files = await listWorkspaceFilesRecursive();
      return { success: true, files };
    } catch (err) {
      return { success: false, error: err.message, files: [] };
    }
  });

  ipcMain.handle("create-workspace-file", async (_event, options) => {
    try {
      const request = options && typeof options === "object" ? options : {};
      const requestedFormat = normalizeFormat(request.format);
      if (!requestedFormat) {
        return { success: false, error: "A file format is required." };
      }
      if (!["xlsx", "docx", "pptx", "pdf"].includes(requestedFormat)) {
        return {
          success: false,
          error: `Unsupported format '${requestedFormat}'. Supported formats: xlsx, docx, pptx, pdf.`,
        };
      }

      const scope = normalizeExcelorScope(request.scope || "onlyoffice");
      const result = await handleCreateFileTool(
        {
          format: requestedFormat,
          title: request.title,
          prompt: request.title,
          open: request.open !== false,
          confirm: true,
        },
        scope,
      );

      if (!result?.success) {
        return { success: false, error: result?.message || "Failed to create file." };
      }

      return {
        success: true,
        message: String(result.message || ""),
        format: String(result.data?.format || requestedFormat),
        fileName: String(result.data?.fileName || ""),
        workspacePath: String(result.data?.workspacePath || ""),
        editorUrl: String(result.data?.editorUrl || ""),
        scope,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("open-workspace-file", async (_event, filePath) => {
    try {
      await ensureWorkspaceDir();

      const targetPath = path.resolve(String(filePath || ""));
      if (!isPathInsideDirectory(WORKSPACE_DIR, targetPath)) {
        throw new Error("Invalid workspace path.");
      }

      const stat = await fs.promises.stat(targetPath);
      if (!stat.isFile()) {
        throw new Error("The selected path is not a file.");
      }

      const ext = path.extname(targetPath).toLowerCase();
      if (ONLYOFFICE_WORKSPACE_EXTS.has(ext)) {
        const opened = await openWorkspaceFileInEditor(targetPath);
        return { success: true, mode: "editor", url: opened.editorUrl };
      }

      const shellResult = await shell.openPath(targetPath);
      if (shellResult) {
        throw new Error(shellResult);
      }
      return { success: true, mode: "external" };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("get-skills", async () => {
    return await skillsManager.getAll();
  });

  ipcMain.handle("skills:list", async (_event, payload) => {
    return skillsManager.listSkillsForIpc(payload || {});
  });

  ipcMain.handle("set-skill-enabled", (_event, skillId, enabled) => {
    return skillsManager.setSkillEnabled(skillId, enabled);
  });

  ipcMain.handle("resync-skills", async () => {
    await refreshExcelorPluginRuntimes();
    return await skillsManager.getAll();
  });

  ipcMain.handle("approve-skill-proposal", async (_event, rawPayload, rawScope) => {
    try {
      const scope = normalizeExcelorScope(rawScope);
      const payload = normalizeApprovedSkillProposalPayload(rawPayload);
      const result = await approveSkillProposalViaServer(payload, scope);
      if (result?.ok === true) {
        const runtime = getExcelorRuntime(scope);
        if (runtime && typeof runtime.resolveSkillProposal === "function") {
          runtime.resolveSkillProposal(payload.proposalId, {
            resolution: "accepted",
            name: payload.name,
            detail: String(result.message || payload.description || ""),
            emitSkillsChanged: result.skillsChanged === true,
          });
        } else if (result.skillsChanged === true && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("skills-changed");
        }
      }
      return result;
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        skillsChanged: false,
      };
    }
  });

  ipcMain.handle("approve-plan-proposal", async (_event, rawPayload, rawScope) => {
    try {
      const scope = normalizeExcelorScope(rawScope);
      const payload = normalizePlanApprovalPayload(rawPayload);
      const runtime = getExcelorRuntime(scope);
      if (!runtime || typeof runtime.approvePlanProposal !== "function") {
        throw new Error(`Excelor runtime for scope '${scope}' is unavailable.`);
      }
      return runtime.approvePlanProposal(payload);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle("request-plan-proposal-revision", async (_event, rawPayload, rawScope) => {
    try {
      const scope = normalizeExcelorScope(rawScope);
      const payload = normalizePlanRevisionPayload(rawPayload);
      const runtime = getExcelorRuntime(scope);
      if (!runtime || typeof runtime.requestPlanProposalRevision !== "function") {
        throw new Error(`Excelor runtime for scope '${scope}' is unavailable.`);
      }
      return runtime.requestPlanProposalRevision(payload);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle("reject-plan-proposal", async (_event, rawPayload, rawScope) => {
    try {
      const scope = normalizeExcelorScope(rawScope);
      const payload = normalizePlanRejectionPayload(rawPayload);
      const runtime = getExcelorRuntime(scope);
      if (!runtime || typeof runtime.rejectPlanProposal !== "function") {
        throw new Error(`Excelor runtime for scope '${scope}' is unavailable.`);
      }
      return runtime.rejectPlanProposal(payload);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle("get-skill-tree", (_event, skillId) => {
    return skillsManager.getSkillTree(String(skillId || ""));
  });

  ipcMain.handle("read-skill-file", (_event, filePath) => {
    return skillsManager.readSkillFile(String(filePath || ""));
  });

  ipcMain.handle("get-plugins", async () => {
    return pluginManager.getCatalog();
  });

  ipcMain.handle("set-plugin-enabled", async (_event, pluginName, enabled) => {
    const catalog = pluginManager.setPluginEnabled(String(pluginName || ""), enabled);
    await refreshExcelorPluginRuntimes();
    return catalog;
  });

  ipcMain.handle("resync-plugins", async () => {
    const catalog = pluginManager.getCatalog();
    await refreshExcelorPluginRuntimes();
    return catalog;
  });

  ipcMain.handle("get-plugin-tree", (_event, pluginId) => {
    return pluginManager.getPluginTree(String(pluginId || ""));
  });

  ipcMain.handle("read-plugin-file", (_event, filePath) => {
    return pluginManager.readPluginFile(String(filePath || ""));
  });

  ipcMain.handle("open-skill-in-editor", async (_event, filePath) => {
    const result = await shell.openPath(filePath);
    if (result) {
      throw new Error(result);
    }
    return { success: true };
  });

  ipcMain.handle("show-skill-in-folder", async (_event, filePath) => {
    shell.showItemInFolder(filePath);
    return { success: true };
  });

  ipcMain.handle("open-plugin-in-editor", async (_event, filePath) => {
    const result = await shell.openPath(filePath);
    if (result) {
      throw new Error(result);
    }
    return { success: true };
  });

  ipcMain.handle("show-plugin-in-folder", async (_event, filePath) => {
    shell.showItemInFolder(filePath);
    return { success: true };
  });

  ipcMain.handle("get-mcp-connectors", () => {
    return runtimeConfigStore.getMcpConnectors();
  });

  ipcMain.handle("add-mcp-connector", (_event, name, url) => {
    return runtimeConfigStore.addMcpConnector(name, url);
  });

  ipcMain.handle("delete-mcp-connector", (_event, connectorId) => {
    runtimeConfigStore.deleteMcpConnector(connectorId);
    return { success: true };
  });

  ipcMain.handle("set-mcp-connector-enabled", (_event, connectorId, enabled) => {
    return runtimeConfigStore.setMcpConnectorEnabled(connectorId, enabled);
  });

  ipcMain.handle("check-mcp-connector", async (_event, connectorId) => {
    return runtimeConfigStore.checkMcpConnector(connectorId);
  });

  ipcMain.handle("disconnect-mcp-connector", (_event, connectorId) => {
    return runtimeConfigStore.disconnectMcpConnector(connectorId);
  });

  ipcMain.handle("get-financial-settings", () => {
    return runtimeConfigStore.getFinancialSettings();
  });

  ipcMain.handle("update-financial-settings", (_event, patch) => {
    return runtimeConfigStore.updateFinancialSettings(patch || {});
  });

  ipcMain.handle("get-financial-mcp-providers", () => {
    return runtimeConfigStore.getFinancialMcpProviders();
  });

  ipcMain.handle("connect-financial-mcp-provider", (_event, providerId, apiKey) => {
    return runtimeConfigStore.connectFinancialMcpProvider(providerId, apiKey);
  });

  ipcMain.handle("disconnect-financial-mcp-provider", (_event, providerId) => {
    return runtimeConfigStore.disconnectFinancialMcpProvider(providerId);
  });

  ipcMain.handle("check-financial-mcp-provider", async (_event, providerId) => {
    return runtimeConfigStore.checkFinancialMcpProvider(providerId);
  });

  ipcMain.handle("sync-financial-mcp-providers", () => {
    return runtimeConfigStore.syncFinancialMcpProviders();
  });

  ipcMain.handle("get-provider-settings", () => {
    return providerStore.getProviderSettings();
  });

  ipcMain.handle("get-provider-meta", () => {
    const mergedModels = {};
    for (const pid of providerStore.PROVIDER_ORDER) {
      mergedModels[pid] = providerStore.getMergedModels(pid);
    }
    return {
      meta: providerStore.PROVIDER_META,
      order: providerStore.PROVIDER_ORDER,
      staticModels: mergedModels,
    };
  });

  ipcMain.handle("set-active-provider", (_event, providerId) => {
    return providerStore.setActiveProvider(providerId);
  });

  ipcMain.handle("connect-provider", (_event, providerId, providerData) => {
    return providerStore.connectProvider(providerId, providerData);
  });

  ipcMain.handle("disconnect-provider", (_event, providerId) => {
    return providerStore.disconnectProvider(providerId);
  });

  ipcMain.handle("update-provider-model", (_event, providerId, modelId) => {
    return providerStore.updateProviderModel(providerId, modelId);
  });

  ipcMain.handle("validate-api-key", async (_event, providerId, apiKey) => {
    return providerStore.validateApiKey(providerId, apiKey);
  });

  ipcMain.handle("fetch-provider-models", async (_event, providerId, apiKey) => {
    return providerStore.fetchProviderModels(providerId, apiKey);
  });

  ipcMain.handle("test-ollama-connection", async (_event, url) => {
    return providerStore.testOllamaConnection(url);
  });

  ipcMain.handle("test-lmstudio-connection", async (_event, url) => {
    return providerStore.testLMStudioConnection(url);
  });

  ipcMain.handle("store-api-key", (_event, providerId, apiKey) => {
    providerStore.storeApiKey(providerId, apiKey);
    return { success: true };
  });

  ipcMain.handle("get-active-provider-config", () => {
    return providerStore.getActiveProviderConfig();
  });

  ipcMain.handle("get-custom-models", (_event, providerId) => {
    return providerStore.getCustomModels(providerId);
  });

  ipcMain.handle("add-custom-model", (_event, providerId, modelId, modelName) => {
    return providerStore.addCustomModel(providerId, modelId, modelName);
  });

  ipcMain.handle("remove-custom-model", (_event, providerId, modelId) => {
    return providerStore.removeCustomModel(providerId, modelId);
  });

  ipcMain.handle("get-merged-models", (_event, providerId) => {
    return providerStore.getMergedModels(providerId);
  });

  ipcMain.handle("login-openai-with-chatgpt", async () => {
    try {
      const { loginOpenAiWithChatGpt } = require("./lib/oauth-browser");
      return await loginOpenAiWithChatGpt();
    } catch (err) {
      console.error("OAuth error:", err);
      return { connected: false, error: err.message };
    }
  });
}

app.whenReady().then(async () => {
  await installOnlyOfficeEditorInterceptor();
  await startBrowserBridge();
  initExcelorRuntimes();
  setupIPC();
  await createWindow();

  skillsWatcher = new SkillsWatcher(() => {
    const { getSkillSources } = require("./lib/skills-manager");
    return getSkillSources().map((s) => s.path).filter(Boolean);
  });
  skillsWatcher.on("update", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("skills:updateAvailable", { version: 2 });
    }
  });
  skillsWatcher.start();

  for (const scope of EXCELOR_SCOPES) {
    const runtime = getExcelorRuntime(scope);
    if (runtime) {
      emitExcelorSnapshot(scope, runtime.getSnapshot());
    }
  }

  tray = new TrayManager(
    path.join(__dirname, "assets", "icon.svg"),
    mainWindow,
    () => {
      app.isQuitting = true;
      if (docker) docker.stop().finally(() => app.quit());
      else app.quit();
    }
  );

  await startServices();
});

app.on("window-all-closed", () => {
  // On Windows, keep running in tray.
});

app.on("before-quit", async () => {
  app.isQuitting = true;
  if (skillsWatcher) {
    try {
      skillsWatcher.stop();
    } catch {
      /* ignore */
    }
    skillsWatcher = null;
  }
  for (const scope of EXCELOR_SCOPES) {
    const runtime = getExcelorRuntime(scope);
    if (runtime && typeof runtime.stop === "function") {
      runtime.stop();
    }
  }
  await mcpAppSessionManager.closeAll();
  await stopBrowserBridge();
  if (docker) await docker.stop();
});

app.on("activate", () => {
  if (mainWindow) mainWindow.show();
});
