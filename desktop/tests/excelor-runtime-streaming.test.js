const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ExcelorRuntime = require("../lib/excelor-runtime");

function createRuntime(overrides = {}) {
  return new ExcelorRuntime({
    getContext: () => ({ documentContext: "spreadsheet", editorLoaded: true }),
    getExecutionConfig: () => ({ providerId: "openrouter", modelId: "openrouter:test-model", env: {} }),
    ...overrides,
  });
}

function createDoneEvent(overrides = {}) {
  return {
    type: "done",
    answer: "Created and populated Deck.pptx.",
    toolCalls: [],
    ...overrides,
  };
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
    'data: {"type":"done","answer":"Hello","toolCalls":[{"tool":"createFile"}]}\n\n';

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
    const result = await runtime._streamRun("test", "openrouter:test-model");
    assert.equal(result.answer, "Hello");
    assert.equal(result.doneEvent?.answer, "Hello");
    assert.equal(result.doneEvent?.toolCalls?.[0]?.tool, "createFile");
    assert.deepEqual(draftSnapshots, ["Hel", "Hello"]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("_executeTurn auto-opens the latest generated pptx after a successful run", async () => {
  const openCalls = [];
  const runtime = createRuntime({
    onOpenGeneratedPptx: async (filePath) => {
      openCalls.push(filePath);
    },
  });
  const absolutePath = path.resolve(path.join("C:", "workspace", "absolute", "Deck.pptx"));
  const workspacePath = path.resolve(path.join("C:", "workspace", "fallback", "Deck.pptx"));
  const thread = runtime.bootstrap();
  thread.activeTurnId = "turn-1";
  thread.status = "running";

  runtime._ensureProcess = async () => {};
  runtime._streamRun = async () => ({
    answer: "Created and populated Deck.pptx.",
    doneEvent: createDoneEvent({
      toolCalls: [
        {
          tool: "createFile",
          args: { format: "pptx" },
          result: JSON.stringify({
            success: true,
            data: {
              format: "pptx",
              absolutePath,
              workspacePath,
            },
          }),
        },
      ],
    }),
  });

  await runtime._executeTurn("build a deck", "turn-1", { modelId: "openrouter:test-model", env: {} });

  assert.deepEqual(openCalls, [absolutePath]);
  assert.equal(thread.status, "idle");
  assert.equal(thread.activeTurnId, null);
  assert.equal(thread.messages.at(-1)?.text, "Created and populated Deck.pptx.");
  assert.ok(thread.activity.some((entry) => entry.title === "Opened presentation in ONLYOFFICE"));
});

test("_executeTurn does not auto-open when the run finishes with a done reason", async () => {
  const openCalls = [];
  const runtime = createRuntime({
    onOpenGeneratedPptx: async (filePath) => {
      openCalls.push(filePath);
    },
  });
  const thread = runtime.bootstrap();
  thread.activeTurnId = "turn-2";
  thread.status = "running";

  runtime._ensureProcess = async () => {};
  runtime._streamRun = async () => ({
    answer: "I created the presentation template, but it is still unpopulated.",
    doneEvent: createDoneEvent({
      reason: "presentation_template_unpopulated",
      toolCalls: [
        {
          tool: "createFile",
          args: { format: "pptx" },
          result: JSON.stringify({
            success: true,
            data: {
              format: "pptx",
              absolutePath: path.resolve(path.join("C:", "workspace", "Deck.pptx")),
            },
          }),
        },
      ],
    }),
  });

  await runtime._executeTurn("build a deck", "turn-2", { modelId: "openrouter:test-model", env: {} });

  assert.equal(openCalls.length, 0);
  assert.equal(thread.messages.at(-1)?.text, "I created the presentation template, but it is still unpopulated.");
});

test("_executeTurn respects createFile open=false for generated pptx files", async () => {
  const openCalls = [];
  const runtime = createRuntime({
    onOpenGeneratedPptx: async (filePath) => {
      openCalls.push(filePath);
    },
  });
  const thread = runtime.bootstrap();
  thread.activeTurnId = "turn-3";
  thread.status = "running";

  runtime._ensureProcess = async () => {};
  runtime._streamRun = async () => ({
    answer: "Blank presentation created.",
    doneEvent: createDoneEvent({
      answer: "Blank presentation created.",
      toolCalls: [
        {
          tool: "createFile",
          args: { format: "pptx", open: false },
          result: JSON.stringify({
            success: true,
            data: {
              format: "pptx",
              absolutePath: path.resolve(path.join("C:", "workspace", "Blank Deck.pptx")),
            },
          }),
        },
      ],
    }),
  });

  await runtime._executeTurn("create a blank pptx", "turn-3", { modelId: "openrouter:test-model", env: {} });

  assert.equal(openCalls.length, 0);
});

test("_executeTurn skips auto-open when the pptx tool result is missing a usable path", async () => {
  const openCalls = [];
  const runtime = createRuntime({
    onOpenGeneratedPptx: async (filePath) => {
      openCalls.push(filePath);
    },
  });
  const thread = runtime.bootstrap();
  thread.activeTurnId = "turn-4";
  thread.status = "running";

  runtime._ensureProcess = async () => {};
  runtime._streamRun = async () => ({
    answer: "Created presentation template.",
    doneEvent: createDoneEvent({
      answer: "Created presentation template.",
      toolCalls: [
        {
          tool: "createFile",
          args: { format: "pptx" },
          result: JSON.stringify({
            success: true,
            data: {
              format: "pptx",
            },
          }),
        },
      ],
    }),
  });

  await runtime._executeTurn("create a deck", "turn-4", { modelId: "openrouter:test-model", env: {} });

  assert.equal(openCalls.length, 0);
});

test("_executeTurn ignores malformed createFile tool results when deciding whether to auto-open", async () => {
  const openCalls = [];
  const runtime = createRuntime({
    onOpenGeneratedPptx: async (filePath) => {
      openCalls.push(filePath);
    },
  });
  const thread = runtime.bootstrap();
  thread.activeTurnId = "turn-5";
  thread.status = "running";

  runtime._ensureProcess = async () => {};
  runtime._streamRun = async () => ({
    answer: "Created presentation template.",
    doneEvent: createDoneEvent({
      answer: "Created presentation template.",
      toolCalls: [
        {
          tool: "createFile",
          args: { format: "pptx" },
          result: "{not valid json",
        },
      ],
    }),
  });

  await runtime._executeTurn("create a deck", "turn-5", { modelId: "openrouter:test-model", env: {} });

  assert.equal(openCalls.length, 0);
});

test("_executeTurn keeps the assistant turn successful when the auto-open callback fails", async () => {
  const runtime = createRuntime({
    onOpenGeneratedPptx: async () => {
      throw new Error("OnlyOffice is unavailable.");
    },
  });
  const absolutePath = path.resolve(path.join("C:", "workspace", "Deck.pptx"));
  const thread = runtime.bootstrap();
  thread.activeTurnId = "turn-6";
  thread.status = "running";

  runtime._ensureProcess = async () => {};
  runtime._streamRun = async () => ({
    answer: "Created and populated Deck.pptx.",
    doneEvent: createDoneEvent({
      toolCalls: [
        {
          tool: "createFile",
          args: { format: "pptx" },
          result: JSON.stringify({
            success: true,
            data: {
              format: "pptx",
              absolutePath,
            },
          }),
        },
      ],
    }),
  });

  await runtime._executeTurn("build a deck", "turn-6", { modelId: "openrouter:test-model", env: {} });

  assert.equal(thread.status, "idle");
  assert.equal(thread.messages.at(-1)?.text, "Created and populated Deck.pptx.");
  assert.equal(thread.lastError, "");
  assert.ok(thread.activity.some((entry) => entry.title === "Failed to open generated presentation"));
  assert.ok(thread.activity.some((entry) => entry.title === "Excelor finished"));
});
