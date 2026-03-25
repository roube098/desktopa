const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_EDITOR_BRIDGE_TIMEOUT_MS,
  PRESENTATION_COLD_START_TIMEOUT_MS,
  PRESENTATION_STEADY_STATE_TIMEOUT_MS,
  getOnlyOfficeToolTimeoutMs,
  buildOnlyOfficeToolTimeoutResult,
  normalizeOnlyOfficeToolResult,
  isPresentationColdStartContext,
} = require("../lib/presentation-tool-contract");

test("non-presentation tools keep the default editor bridge timeout", () => {
  const timeoutMs = getOnlyOfficeToolTimeoutMs(
    { contextType: "document", toolName: "insertText" },
    { documentContext: "document", editorLoaded: true },
  );

  assert.equal(timeoutMs, DEFAULT_EDITOR_BRIDGE_TIMEOUT_MS);
});

test("presentation cold start gets the extended timeout budget", () => {
  const context = {
    documentContext: "presentation",
    editorLoaded: false,
    editorUrl: "http://localhost:8080/example/editor?fileName=Deck.pptx",
    editorFrameStatus: "assigned",
    presentationBridgeReady: false,
  };

  assert.equal(isPresentationColdStartContext(context), true);
  assert.equal(
    getOnlyOfficeToolTimeoutMs({ contextType: "presentation", toolName: "addSlide" }, context),
    PRESENTATION_COLD_START_TIMEOUT_MS,
  );
});

test("ready presentation sessions use the steady-state timeout budget", () => {
  const context = {
    documentContext: "presentation",
    editorLoaded: true,
    editorUrl: "http://localhost:8080/example/editor?fileName=Deck.pptx",
    editorFrameStatus: "ready",
    presentationBridgeReady: true,
  };

  assert.equal(isPresentationColdStartContext(context), false);
  assert.equal(
    getOnlyOfficeToolTimeoutMs({ contextType: "presentation", toolName: "addSlide" }, context),
    PRESENTATION_STEADY_STATE_TIMEOUT_MS,
  );
});

test("presentation timeout result preserves cold-start diagnostics", () => {
  const result = buildOnlyOfficeToolTimeoutResult(
    { contextType: "presentation", toolName: "addSlide" },
    {
      documentContext: "presentation",
      editorLoaded: false,
      editorUrl: "http://localhost:8080/example/editor?fileName=Deck.pptx",
      editorFrameStatus: "assigned",
      editorFrameMessage: "Opening OnlyOffice editor...",
      presentationBridgeReady: false,
    },
    PRESENTATION_COLD_START_TIMEOUT_MS,
  );

  assert.equal(result.success, false);
  assert.match(result.message, /startup handshake did not complete/i);
  assert.equal(result.data.reason, "presentation_editor_not_ready");
  assert.equal(result.data.bridgeTimeoutMs, PRESENTATION_COLD_START_TIMEOUT_MS);
  assert.equal(result.data.coldStart, true);
  assert.equal(result.data.editorFrameStatus, "assigned");
  assert.equal(result.data.presentationBridgeReady, false);
});

test("normalizeOnlyOfficeToolResult preserves presentation diagnostics on failures", () => {
  const normalized = normalizeOnlyOfficeToolResult(
    { success: false, message: "OnlyOffice presentation bridge still initializing." },
    { contextType: "presentation", toolName: "addSlide" },
    {
      documentContext: "presentation",
      editorLoaded: false,
      editorUrl: "http://localhost:8080/example/editor?fileName=Deck.pptx",
      editorFrameStatus: "ready",
      presentationBridgeReady: false,
    },
  );

  assert.equal(normalized.success, false);
  assert.equal(normalized.data.reason, "presentation_bridge_not_ready");
  assert.equal(normalized.data.editorFrameStatus, "ready");
  assert.equal(normalized.data.presentationBridgeReady, false);
  assert.equal(normalized.data.coldStart, true);
});

test("normalizeOnlyOfficeToolResult maps internal bridge-wait reasons to public presentation reasons", () => {
  const normalized = normalizeOnlyOfficeToolResult(
    {
      success: false,
      message: "Presentation bridge plugin is not available in the editor.",
      data: { reason: "bridge_unavailable_after_wait" },
    },
    { contextType: "presentation", toolName: "addSlide" },
    {
      documentContext: "presentation",
      editorLoaded: false,
      editorUrl: "http://localhost:8080/example/editor?fileName=Deck.pptx",
      editorFrameStatus: "ready",
      presentationBridgeReady: false,
    },
  );

  assert.equal(normalized.success, false);
  assert.equal(normalized.data.reason, "presentation_bridge_not_ready");
});

test("normalizeOnlyOfficeToolResult lifts slideIndex from single-action addSlide results", () => {
  const normalized = normalizeOnlyOfficeToolResult(
    {
      success: true,
      message: "Presentation actions applied.",
      data: {
        results: [{ slideIndex: 3, layout: "titleContent" }],
      },
    },
    { contextType: "presentation", toolName: "addSlide" },
    {
      documentContext: "presentation",
      editorLoaded: true,
      editorUrl: "http://localhost:8080/example/editor?fileName=Deck.pptx",
      editorFrameStatus: "ready",
      presentationBridgeReady: true,
    },
  );

  assert.equal(normalized.success, true);
  assert.equal(normalized.data.slideIndex, 3);
  assert.deepEqual(normalized.data.results, [{ slideIndex: 3, layout: "titleContent" }]);
});
