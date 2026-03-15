const test = require("node:test");
const assert = require("node:assert/strict");

const ExcelorRuntime = require("../lib/excelor-runtime");

function createRuntime() {
  return new ExcelorRuntime({
    getContext: () => ({ documentContext: "spreadsheet", editorLoaded: true }),
    getExecutionConfig: () => ({ providerId: "openrouter", modelId: "openrouter:test-model", env: {} }),
  });
}

test("response_delta events accumulate draft assistant text and done clears it", () => {
  const runtime = createRuntime();
  const thread = runtime.bootstrap();
  thread.activeTurnId = "turn-1";

  runtime._handleAgentEvent({ type: "response_delta", delta: "Hello" });
  runtime._handleAgentEvent({ type: "response_delta", delta: " world" });

  let snapshot = runtime.getSnapshot();
  assert.equal(snapshot.draftAssistantText, "Hello world");

  runtime._handleAgentEvent({ type: "done", answer: "Hello world" });
  snapshot = runtime.getSnapshot();
  assert.equal(snapshot.draftAssistantText, "");
});

test("_streamRun consumes SSE response_delta events and returns final done answer", async () => {
  const runtime = createRuntime();
  const encoder = new TextEncoder();
  const payload =
    'data: {"type":"response_delta","delta":"Hel"}\n\n' +
    'data: {"type":"response_delta","delta":"lo"}\n\n' +
    'data: {"type":"done","answer":"Hello"}\n\n';

  const draftSnapshots = [];
  const originalHandler = runtime._handleAgentEvent.bind(runtime);
  runtime._handleAgentEvent = (event) => {
    originalHandler(event);
    if (event.type === "response_delta") {
      draftSnapshots.push(runtime.getSnapshot().draftAssistantText);
    }
  };

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(payload));
        controller.close();
      },
    }),
  });

  try {
    const answer = await runtime._streamRun("test", "openrouter:test-model");
    assert.equal(answer, "Hello");
    assert.deepEqual(draftSnapshots, ["Hel", "Hello"]);
  } finally {
    global.fetch = originalFetch;
  }
});
