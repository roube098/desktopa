const CONNECT_EDITOR_MARKER = "        var connectEditor = function () {";
const DEFAULT_ONLYOFFICE_ORIGINS = ["http://localhost:8080", "http://127.0.0.1:8080"];

function buildOnlyOfficeEditorUrl(onlyofficeOrigin, searchParams = {}) {
  const url = new URL("/example/editor", String(onlyofficeOrigin || "http://localhost:8080"));
  Object.entries(searchParams).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function buildOnlyOfficeEditorBootstrap() {
  return [
    "        (function () {",
    "          var editorReadySent = false;",
    "          var editorErrorSent = false;",
    "",
    "          function getDocumentType() {",
    "            return window.config && window.config.documentType ? String(window.config.documentType) : '';",
    "          }",
    "",
    "          function postToParent(payload) {",
    "            try {",
    "              window.parent.postMessage(payload, '*');",
    "            } catch (_error) {}",
    "          }",
    "",
    "          function notifyEditorReady() {",
    "            if (editorReadySent) return;",
    "            editorReadySent = true;",
    "            postToParent({ type: 'onlyoffice-editor-ready', documentType: getDocumentType() });",
    "          }",
    "",
    "          function notifyEditorError(message) {",
    "            if (editorReadySent || editorErrorSent) return;",
    "            editorErrorSent = true;",
    "            postToParent({",
    "              type: 'onlyoffice-editor-error',",
    "              documentType: getDocumentType(),",
    "              message: message || 'OnlyOffice editor failed to initialize.',",
    "            });",
    "          }",
    "",
    "          function monitorEditorStartup() {",
    "            var startedAt = Date.now();",
    "            function check() {",
    "              try {",
    "                var editorRoot = window.document.getElementById('iframeEditor');",
    "                var nestedFrame = editorRoot && editorRoot.querySelector ? editorRoot.querySelector('iframe') : null;",
    "                if (nestedFrame || window.docEditor) {",
    "                  notifyEditorReady();",
    "                  return;",
    "                }",
    "                if (Date.now() - startedAt >= 10000) {",
    "                  notifyEditorError('OnlyOffice editor runtime did not initialize.');",
    "                  return;",
    "                }",
    "                window.setTimeout(check, 250);",
    "              } catch (error) {",
    "                notifyEditorError(error && error.message ? error.message : 'OnlyOffice editor bootstrap failed.');",
    "              }",
    "            }",
    "            window.setTimeout(check, 0);",
    "          }",
    "",
    "          window.addEventListener('error', function (event) {",
    "            notifyEditorError(event && event.message ? event.message : 'OnlyOffice editor reported a script error.');",
    "          });",
    "",
    "          window.addEventListener('unhandledrejection', function (event) {",
    "            var reason = event ? event.reason : null;",
    "            var message = reason && reason.message ? reason.message : String(reason || 'OnlyOffice editor reported an unhandled rejection.');",
    "            notifyEditorError(message);",
    "          });",
    "",
    "          window.__excelorOnlyOfficeConnectEditorHook = function () {",
    "            try {",
    "              monitorEditorStartup();",
    "            } catch (error) {",
    "              notifyEditorError(error && error.message ? error.message : 'OnlyOffice editor bootstrap failed.');",
    "            }",
    "          };",
    "        })();",
  ].join("\n");
}

function normalizeOrigin(origin) {
  const value = String(origin || "").trim();
  if (!value) return "";
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function rewriteOnlyOfficeServiceUrls(html, options = {}) {
  if (typeof html !== "string" || !html) {
    return html;
  }

  const containerOrigin = normalizeOrigin(options.containerOrigin);
  if (!containerOrigin) {
    return html;
  }

  const browserOrigins = Array.from(
    new Set(
      (Array.isArray(options.browserOrigins) ? options.browserOrigins : DEFAULT_ONLYOFFICE_ORIGINS)
        .map(normalizeOrigin)
        .filter(Boolean),
    ),
  );

  return browserOrigins.reduce((result, browserOrigin) => {
    let next = result;
    next = next.replace(
      new RegExp(`(\"url\"\\s*:\\s*\")${browserOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\/example\\/download[^"]*\")`, "g"),
      `$1${containerOrigin}$2`,
    );
    next = next.replace(
      new RegExp(`(\"callbackUrl\"\\s*:\\s*\")${browserOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\/example\\/track[^"]*\")`, "g"),
      `$1${containerOrigin}$2`,
    );
    return next;
  }, html);
}

function injectOnlyOfficeEditorBootstrap(html, options = {}) {
  if (typeof html !== "string" || !html.includes(CONNECT_EDITOR_MARKER)) {
    return html;
  }

  const bootstrap = buildOnlyOfficeEditorBootstrap(options);
  return html.replace(
    CONNECT_EDITOR_MARKER,
    `${bootstrap}\n\n${CONNECT_EDITOR_MARKER}\n          if (typeof window.__excelorOnlyOfficeConnectEditorHook === 'function') window.__excelorOnlyOfficeConnectEditorHook();`,
  );
}

function isLocalOnlyOfficeBridgePath(pathname = "") {
  return pathname === "/browser/action" || pathname === "/editor/tool";
}

function isOnlyOfficeEditorRequest(rawUrl, options = {}) {
  try {
    const parsed = rawUrl instanceof URL ? rawUrl : new URL(String(rawUrl || ""));
    const onlyofficePort = String(options.onlyofficePort || "8080");
    const hostname = String(parsed.hostname || "").toLowerCase();
    return (
      (hostname === "127.0.0.1" || hostname === "localhost") &&
      String(parsed.port || "80") === onlyofficePort &&
      parsed.pathname === "/example/editor"
    );
  } catch (_error) {
    return false;
  }
}

module.exports = {
  buildOnlyOfficeEditorUrl,
  buildOnlyOfficeEditorBootstrap,
  rewriteOnlyOfficeServiceUrls,
  injectOnlyOfficeEditorBootstrap,
  isLocalOnlyOfficeBridgePath,
  isOnlyOfficeEditorRequest,
};
