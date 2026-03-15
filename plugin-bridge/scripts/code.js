(function () {
  "use strict";
  var BRIDGE_GUID = "asc.{7F90C4D8-9B66-4C44-9015-22C8C2A2D84F}";
  var STARTUP_RETRY_DELAY_MS = 150;
  var STARTUP_RETRY_BUDGET_MS = 3000;
  var bridgeAttached = false;
  var bridgeReadySent = false;
  var startupTimerId = null;
  var startupDeadline = 0;

  function hasBridgeCore() {
    return !!(
      window.PresentationBridgeCore &&
      typeof window.PresentationBridgeCore.attachMessageBridge === "function"
    );
  }

  function hasPluginRuntime() {
    return !!(
      window.Asc &&
      window.Asc.plugin &&
      typeof window.Asc.plugin.callCommand === "function"
    );
  }

  function clearStartupTimer() {
    if (startupTimerId !== null) {
      window.clearTimeout(startupTimerId);
      startupTimerId = null;
    }
  }

  function attachBridgeOnce() {
    if (bridgeAttached) {
      return true;
    }
    if (!hasBridgeCore()) {
      return false;
    }
    window.PresentationBridgeCore.attachMessageBridge();
    bridgeAttached = true;
    return true;
  }

  function postBridgeReady() {
    if (bridgeReadySent) {
      return;
    }
    if (!hasPluginRuntime()) {
      return;
    }
    bridgeReadySent = true;
    try {
      window.parent.postMessage({ type: "presentation-bridge-ready", bridgeGuid: BRIDGE_GUID }, "*");
    } catch (_error) {
      // Ignore handshake failures; host will fall back to discovery.
    }
  }

  function ensureBridgeStarted() {
    if (!startupDeadline) {
      startupDeadline = Date.now() + STARTUP_RETRY_BUDGET_MS;
    }

    var attached = attachBridgeOnce();
    if (attached && hasPluginRuntime()) {
      clearStartupTimer();
      postBridgeReady();
      return;
    }

    if (Date.now() >= startupDeadline) {
      clearStartupTimer();
      return;
    }

    if (startupTimerId !== null) {
      return;
    }

    startupTimerId = window.setTimeout(function () {
      startupTimerId = null;
      ensureBridgeStarted();
    }, STARTUP_RETRY_DELAY_MS);
  }

  window.Asc.plugin.init = function () {
    ensureBridgeStarted();
  };

  window.Asc.plugin.event_onDocumentContentReady = function () {
    ensureBridgeStarted();
  };

  window.Asc.plugin.button = function () {};
})();
