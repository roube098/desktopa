const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
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

test("response_delta events accumulate draft assistant text and done clears it", async () => {
  const runtime = createRuntime();
  const thread = runtime.bootstrap();
  thread.activeTurnId = "turn-1";

  await runtime._handleAgentEvent({ type: "response_delta", delta: "Hello" });
  await runtime._handleAgentEvent({ type: "response_delta", delta: " world" });

  let snapshot = runtime.getSnapshot();
  assert.equal(snapshot.draftAssistantText, "Hello world");

  await runtime._handleAgentEvent({ type: "done", answer: "Hello world" });
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
  runtime._handleAgentEvent = async (event) => {
    await originalHandler(event);
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

test("_streamRun tolerates heartbeat SSE events between response and completion", async () => {
  const runtime = createRuntime();
  const encoder = new TextEncoder();
  const payload =
    'data: {"type":"response_delta","delta":"Thinking"}\n\n' +
    'data: {"type":"heartbeat","at":"2026-04-14T05:00:00.000Z"}\n\n' +
    'data: {"type":"done","answer":"Thinking complete","toolCalls":[]}\n\n';

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
    assert.equal(result.answer, "Thinking complete");
    assert.equal(result.doneEvent?.answer, "Thinking complete");
  } finally {
    global.fetch = originalFetch;
  }
});

test("_streamRun sends desktopContext in the /run request body", async () => {
  let parsedBody = null;
  const runtime = createRuntime({
    getContext: () => ({
      scope: "onlyoffice",
      documentContext: "presentation",
      editorLoaded: true,
      activeFileName: "Deck.pptx",
      activeWorkspacePath: "C:\\workspace\\Deck.pptx",
    }),
  });
  const encoder = new TextEncoder();
  const originalFetch = global.fetch;
  global.fetch = async (_url, options = {}) => {
    parsedBody = JSON.parse(String(options.body || "{}"));
    return {
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"done","answer":"ok","toolCalls":[]}\n\n'));
          controller.close();
        },
      }),
    };
  };

  try {
    await runtime._streamRun("test prompt", "openrouter:test-model");
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(parsedBody.desktopContext.scope, "onlyoffice");
  assert.equal(parsedBody.desktopContext.documentContext, "presentation");
  assert.equal(parsedBody.desktopContext.activeFileName, "Deck.pptx");
});

test("_streamRun sends planModeState in the /run request body", async () => {
  let parsedBody = null;
  const runtime = createRuntime();
  const thread = runtime.bootstrap();
  thread.planMode = {
    active: false,
    status: "approved",
    revision: 2,
    previousMode: "default",
    approvedPlan: {
      planId: "plan-1",
      proposalId: "proposal-1",
      title: "Approved plan",
      summary: "Summary",
      body: "Body",
      revision: 2,
    },
  };
  const encoder = new TextEncoder();
  const originalFetch = global.fetch;
  global.fetch = async (_url, options = {}) => {
    parsedBody = JSON.parse(String(options.body || "{}"));
    return {
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"done","answer":"ok","toolCalls":[]}\n\n'));
          controller.close();
        },
      }),
    };
  };

  try {
    await runtime._streamRun("test prompt", "openrouter:test-model");
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(parsedBody.planModeState.status, "approved");
  assert.equal(parsedBody.planModeState.approvedPlan.title, "Approved plan");
});

test("enterPlanMode enters plan mode from an inactive state and emits a snapshot immediately", () => {
  const runtime = createRuntime();
  const snapshots = [];
  runtime.on("snapshot", (snapshot) => {
    snapshots.push(snapshot);
  });

  const snapshot = runtime.enterPlanMode();

  assert.equal(snapshot.planMode.active, true);
  assert.equal(snapshot.planMode.status, "active");
  assert.equal(snapshot.planMode.previousMode, "default");
  assert.equal(snapshot.planMode.revision, 0);
  assert.match(String(snapshot.planMode.planId || ""), /^plan-/);
  assert.equal(snapshots.at(-1)?.planMode?.active, true);
});

test("enterPlanMode is idempotent when plan mode is already active", () => {
  const runtime = createRuntime();
  const firstSnapshot = runtime.enterPlanMode();
  const secondSnapshot = runtime.enterPlanMode();

  assert.equal(secondSnapshot.planMode.active, true);
  assert.equal(secondSnapshot.planMode.planId, firstSnapshot.planMode.planId);
  assert.equal(secondSnapshot.planMode.enteredAt, firstSnapshot.planMode.enteredAt);
  assert.equal(secondSnapshot.planProposals.length, 0);
});

test("enterPlanMode preserves the approved plan and clears pending plan proposals", () => {
  const runtime = createRuntime();
  const thread = runtime.bootstrap();
  thread.planMode = {
    active: false,
    status: "approved",
    revision: 2,
    previousMode: "default",
    approvedPlan: {
      planId: "approved-plan",
      proposalId: "approved-proposal",
      title: "Approved plan",
      summary: "Keep this context.",
      body: "Approved body",
      revision: 2,
    },
  };
  thread.planProposals = [
    {
      id: "plan-prop-1",
      proposalId: "proposal-1",
      planId: "stale-plan",
      title: "Pending proposal",
      summary: "Old pending summary",
      body: "Old pending body",
      revision: 3,
      createdAt: new Date().toISOString(),
    },
  ];

  const snapshot = runtime.enterPlanMode();

  assert.equal(snapshot.planMode.active, true);
  assert.equal(snapshot.planMode.status, "active");
  assert.equal(snapshot.planMode.approvedPlan?.title, "Approved plan");
  assert.equal(snapshot.planProposals.length, 0);
  assert.notEqual(snapshot.planMode.planId, "approved-plan");
});

test("exitPlanMode leaves plan mode from an active state and clears pending proposals", () => {
  const runtime = createRuntime();
  runtime.enterPlanMode();
  const thread = runtime.bootstrap();
  thread.planProposals = [
    {
      id: "plan-prop-1",
      proposalId: "proposal-1",
      planId: "plan-1",
      title: "Pending",
      summary: "Summary",
      body: "Body",
      revision: 1,
      createdAt: new Date().toISOString(),
    },
  ];

  const snapshots = [];
  runtime.on("snapshot", (snapshot) => {
    snapshots.push(snapshot);
  });

  const snapshot = runtime.exitPlanMode();

  assert.equal(snapshot.planMode.active, false);
  assert.equal(snapshot.planMode.status, "inactive");
  assert.equal(snapshot.planProposals.length, 0);
  assert.equal(snapshots.at(-1)?.planMode?.active, false);
});

test("exitPlanMode is idempotent when plan mode is already inactive", () => {
  const runtime = createRuntime();
  const first = runtime.exitPlanMode();
  const second = runtime.exitPlanMode();

  assert.equal(first.planMode.active, false);
  assert.equal(second.planMode.active, false);
});

test("exitPlanMode preserves approvedPlan and sets status to approved", () => {
  const runtime = createRuntime();
  const thread = runtime.bootstrap();
  thread.planMode = {
    active: true,
    status: "active",
    planId: "plan-x",
    revision: 1,
    previousMode: "default",
    approvedPlan: {
      planId: "plan-x",
      proposalId: "prop-x",
      title: "Earlier approval",
      summary: "S",
      body: "B",
      revision: 1,
    },
  };

  const snapshot = runtime.exitPlanMode();

  assert.equal(snapshot.planMode.active, false);
  assert.equal(snapshot.planMode.status, "approved");
  assert.equal(snapshot.planMode.approvedPlan?.title, "Earlier approval");
});

test("_prepareExecutionConfig rejects missing provider env before starting the server process", async () => {
  let ensureProcessCalled = false;
  const runtime = createRuntime({
    getExecutionConfig: async () => ({
      providerId: "openrouter",
      modelId: "openrouter:test-model",
      env: {},
    }),
  });

  runtime._ensureProcess = async () => {
    ensureProcessCalled = true;
  };

  await assert.rejects(
    runtime._prepareExecutionConfig(),
    /OPENROUTER_API_KEY/,
  );

  assert.equal(ensureProcessCalled, false);
  assert.match(runtime.getSnapshot().lastError, /OPENROUTER_API_KEY/);
});

test("_prepareExecutionConfig allows local providers without an API key", async () => {
  let ensureProcessCalled = false;
  const runtime = createRuntime({
    getExecutionConfig: async () => ({
      providerId: "ollama",
      modelId: "ollama:llama3.2",
      env: { OLLAMA_BASE_URL: "http://localhost:11434" },
    }),
  });

  runtime._ensureProcess = async () => {
    ensureProcessCalled = true;
  };

  const executionConfig = await runtime._prepareExecutionConfig();

  assert.equal(ensureProcessCalled, true);
  assert.equal(executionConfig.providerId, "ollama");
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

test("_executeTurn auto-opens plugin-generated pptx outputs", async () => {
  const openCalls = [];
  const runtime = createRuntime({
    onOpenGeneratedPptx: async (filePath) => {
      openCalls.push(filePath);
    },
  });
  const absolutePath = path.resolve(path.join("C:", "workspace", "slides", "output", "presentation.pptx"));
  const thread = runtime.bootstrap();
  thread.activeTurnId = "turn-plugin";
  thread.status = "running";

  runtime._ensureProcess = async () => {};
  runtime._streamRun = async () => ({
    answer: "Compiled the deck.",
    doneEvent: createDoneEvent({
      answer: "Compiled the deck.",
      toolCalls: [
        {
          tool: "compilePresentationSlides",
          args: {},
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

  await runtime._executeTurn("build a plugin deck", "turn-plugin", { modelId: "openrouter:test-model", env: {} });

  assert.deepEqual(openCalls, [absolutePath]);
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

test("_handleAgentEvent records tool approval and denial activity entries", async () => {
  const runtime = createRuntime();

  await runtime._handleAgentEvent({
    type: "tool_approval",
    tool: "write_file",
    args: { path: "slides/slide-01.js" },
    approved: "allow-once",
  });
  await runtime._handleAgentEvent({
    type: "tool_denied",
    tool: "edit_file",
    args: { path: "C:\\workspace\\outside.txt" },
  });

  const thread = runtime.getSnapshot();
  assert.ok(thread.activity.some((entry) => entry.title === "Tool approval: write_file" && /allow-once/.test(entry.detail || "")));
  assert.ok(thread.activity.some((entry) => entry.title === "Tool denied: edit_file" && /outside\.txt/.test(entry.detail || "")));
});

test("_handleAgentEvent maps spawn_agent input onto the corresponding subagent task prompt", async () => {
  const runtime = createRuntime();
  const createdAt = new Date().toISOString();

  await runtime._handleAgentEvent({
    type: "subagent_spawned",
    agent_id: "subagent-1",
    conversation_id: "conv-test",
    nickname: "check-workspace",
    role: "workspace",
    status: "running",
    parent_thread_id: "main",
    depth: 1,
    at: createdAt,
  });

  await runtime._handleAgentEvent({
    type: "tool_end",
    tool: "spawn_agent",
    args: { input: "Check workspace structure thoroughly." },
    result: JSON.stringify({
      ok: true,
      agent_id: "subagent-1",
      status: "running",
    }),
  });

  const snapshot = runtime.getSnapshot();
  assert.equal(snapshot.subagents[0].taskPrompt, "Check workspace structure thoroughly.");
  assert.equal(snapshot.subagentPrompts.length, 1);
  assert.equal(snapshot.subagentPrompts[0].agentId, "subagent-1");
  assert.equal(snapshot.subagentPrompts[0].prompt, "Check workspace structure thoroughly.");
  assert.equal(snapshot.subagentPrompts[0].toolName, "spawn_agent");
});

test("_handleAgentEvent forwards MCP app tool results as soon as tool_end arrives", async () => {
  const calls = [];
  const runtime = createRuntime({
    onMcpAppToolResult: async (payload) => {
      calls.push(payload);
    },
  });

  await runtime._handleAgentEvent({
    type: "tool_end",
    tool: "mcp_tldraw_exec",
    args: {
      prompt: "Draw a flowchart",
    },
    result: JSON.stringify({
      data: {
        connector: {
          id: "builtin-tldraw",
          name: "tldraw",
          title: "tldraw Canvas",
          builtInAppId: "tldraw",
        },
        remoteToolName: "exec",
        content: [
          { type: "text", text: "Canvas ready." },
        ],
        structuredContent: {
          canvasId: "canvas-123",
        },
        meta: {
          ui: {
            resourceUri: "ui://show-canvas/mcp-app.html",
          },
        },
        appSession: {
          sessionId: "session-123",
          resourceUri: "ui://show-canvas/mcp-app.html",
          builtInAppId: "tldraw",
        },
      },
    }),
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].appSession.sessionId, "session-123");
  assert.equal(calls[0].remoteToolName, "exec");
  assert.equal(calls[0].structuredContent.canvasId, "canvas-123");
});

test("_handleAgentEvent updates task prompt from send_input for an existing subagent", async () => {
  const runtime = createRuntime();
  const createdAt = new Date().toISOString();

  await runtime._handleAgentEvent({
    type: "subagent_spawned",
    agent_id: "subagent-2",
    conversation_id: "conv-test",
    nickname: "compile-deck",
    role: "workspace",
    status: "running",
    parent_thread_id: "main",
    depth: 1,
    at: createdAt,
  });

  await runtime._handleAgentEvent({
    type: "tool_end",
    tool: "spawn_agent",
    args: {
      input: "Plan the slide outline first.",
    },
    result: JSON.stringify({
      ok: true,
      agent_id: "subagent-2",
      status: "running",
    }),
  });

  await runtime._handleAgentEvent({
    type: "tool_end",
    tool: "send_input",
    args: {
      agent_id: "subagent-2",
      input: "Now verify output path and run text extraction.",
    },
    result: JSON.stringify({
      ok: true,
      agent_id: "subagent-2",
      status: "running",
    }),
  });

  const snapshot = runtime.getSnapshot();
  assert.equal(snapshot.subagents[0].taskPrompt, "Now verify output path and run text extraction.");
  assert.equal(snapshot.subagentPrompts.length, 2);
  assert.equal(snapshot.subagentPrompts[0].prompt, "Plan the slide outline first.");
  assert.equal(snapshot.subagentPrompts[1].prompt, "Now verify output path and run text extraction.");
  assert.equal(snapshot.subagentPrompts[1].toolName, "send_input");
});

test("resetConversation clears subagents and subagentPrompts and rotates conversationId", async () => {
  const runtime = createRuntime();
  const beforeId = runtime.getSnapshot().conversationId;
  const createdAt = new Date().toISOString();

  await runtime._handleAgentEvent({
    type: "subagent_spawned",
    agent_id: "subagent-reset",
    nickname: "r",
    role: "workspace",
    status: "running",
    parent_thread_id: "main",
    depth: 1,
    at: createdAt,
  });
  await runtime._handleAgentEvent({
    type: "tool_end",
    tool: "spawn_agent",
    args: { input: "task" },
    result: JSON.stringify({ ok: true, agent_id: "subagent-reset", status: "running" }),
  });

  let snapshot = runtime.getSnapshot();
  assert.ok(snapshot.subagents.length > 0);
  assert.ok(snapshot.subagentPrompts.length > 0);
  assert.equal(snapshot.subagentPrompts[0].conversationId, beforeId);

  await runtime.resetConversation();
  snapshot = runtime.getSnapshot();
  assert.equal(snapshot.subagents.length, 0);
  assert.equal(snapshot.subagentPrompts.length, 0);
  assert.notEqual(snapshot.conversationId, beforeId);
});

test("resolveSkillProposal removes the pending proposal without mutating chat conversation state", () => {
  const runtime = createRuntime();
  const thread = runtime.bootstrap();
  const beforeConversationId = runtime.getSnapshot().conversationId;
  const originalMessage = {
    id: "msg-1",
    role: "assistant",
    text: "Canvas connector is ready.",
    createdAt: new Date().toISOString(),
  };

  thread.messages.push(originalMessage);
  thread.skillProposals = [{
    id: "skill-proposal-1",
    proposalId: "proposal-1",
    action: "create",
    name: "mcp-connector-exploration",
    description: "Systematic MCP connector exploration workflow.",
    body: "# Skill body",
    createdAt: new Date().toISOString(),
    status: "pending",
  }];

  let skillsChangedCount = 0;
  runtime.on("skills-changed", () => {
    skillsChangedCount += 1;
  });

  const snapshot = runtime.resolveSkillProposal("proposal-1", {
    resolution: "accepted",
    name: "mcp-connector-exploration",
    detail: "Created skill at C:\\Users\\roube\\.excelor\\skills\\mcp-connector-exploration\\SKILL.md",
    emitSkillsChanged: true,
  });

  assert.equal(snapshot.conversationId, beforeConversationId);
  assert.equal(snapshot.messages.length, 1);
  assert.equal(snapshot.messages[0].text, originalMessage.text);
  assert.equal(snapshot.activeTurnId, null);
  assert.equal(snapshot.status, "idle");
  assert.equal(snapshot.skillProposals.length, 0);
  assert.equal(skillsChangedCount, 1);
  assert.ok(snapshot.activity.some((entry) => entry.title === "Skill approved: mcp-connector-exploration"));
});

test("_handleAgentEvent stores plan mode changes and plan proposals in the snapshot", async () => {
  const runtime = createRuntime();

  await runtime._handleAgentEvent({
    type: "plan_mode_changed",
    state: {
      active: true,
      status: "awaiting_approval",
      planId: "plan-22",
      revision: 3,
      previousMode: "default",
    },
  });
  await runtime._handleAgentEvent({
    type: "plan_proposal",
    proposalId: "proposal-22",
    planId: "plan-22",
    title: "Plan title",
    summary: "Plan summary",
    body: "## Summary\n\nBody",
    revision: 3,
    createdAt: "2026-04-13T10:00:00.000Z",
  });

  const snapshot = runtime.getSnapshot();
  assert.equal(snapshot.planMode.status, "awaiting_approval");
  assert.equal(snapshot.planProposals.length, 1);
  assert.equal(snapshot.planProposals[0].title, "Plan title");
});

test("approvePlanProposal exits plan mode and keeps the approved plan for later turns", () => {
  const runtime = createRuntime();
  const thread = runtime.bootstrap();
  thread.planMode = {
    active: true,
    status: "awaiting_approval",
    planId: "plan-7",
    revision: 1,
    previousMode: "default",
  };
  thread.planProposals = [{
    id: "entry-7",
    proposalId: "proposal-7",
    planId: "plan-7",
    title: "Plan title",
    summary: "Plan summary",
    body: "Body",
    revision: 1,
    createdAt: "2026-04-13T10:00:00.000Z",
  }];

  const result = runtime.approvePlanProposal({
    proposalId: "proposal-7",
    planId: "plan-7",
    title: "Plan title",
    summary: "Plan summary",
    body: "Body",
    revision: 1,
  });

  assert.equal(result.ok, true);
  const snapshot = runtime.getSnapshot();
  assert.equal(snapshot.planMode.active, false);
  assert.equal(snapshot.planMode.status, "approved");
  assert.equal(snapshot.planMode.approvedPlan.title, "Plan title");
  assert.equal(snapshot.planProposals.length, 0);
});

test("_handleAgentEvent tolerates malformed collaboration tool results without mutating task prompt", async () => {
  const runtime = createRuntime();
  const createdAt = new Date().toISOString();

  await runtime._handleAgentEvent({
    type: "subagent_spawned",
    agent_id: "subagent-3",
    conversation_id: "conv-test",
    nickname: "workspace-diag",
    role: "workspace",
    status: "running",
    parent_thread_id: "main",
    depth: 1,
    at: createdAt,
  });

  await runtime._handleAgentEvent({
    type: "tool_end",
    tool: "send_input",
    args: {
      agent_id: "subagent-3",
      input: "Inspect package dependencies.",
    },
    result: "{not-valid-json",
  });

  const snapshot = runtime.getSnapshot();
  assert.equal(snapshot.subagents[0].taskPrompt, undefined);
  assert.equal(snapshot.subagentPrompts.length, 0);
});

test("_handleAgentEvent stores task prompt even when collaboration result arrives before lifecycle event", async () => {
  const runtime = createRuntime();
  const createdAt = new Date().toISOString();

  await runtime._handleAgentEvent({
    type: "tool_end",
    tool: "spawn_agent",
    args: { input: "Explore CRM architecture deeply." },
    result: JSON.stringify({
      ok: true,
      agent_id: "subagent-4",
      status: "running",
    }),
  });

  await runtime._handleAgentEvent({
    type: "subagent_spawned",
    agent_id: "subagent-4",
    conversation_id: "conv-test",
    nickname: "crm-explorer",
    role: "workspace",
    status: "running",
    parent_thread_id: "main",
    depth: 1,
    at: createdAt,
  });

  const snapshot = runtime.getSnapshot();
  assert.equal(snapshot.subagents[0].taskPrompt, "Explore CRM architecture deeply.");
  assert.equal(snapshot.subagentPrompts.length, 1);
  assert.equal(snapshot.subagentPrompts[0].agentId, "subagent-4");
  assert.equal(snapshot.subagentPrompts[0].toolName, "spawn_agent");
});

test("_executeTurn surfaces terminal done reasons as runtime errors instead of successful completions", async () => {
  const runtime = createRuntime();
  const thread = runtime.bootstrap();
  thread.activeTurnId = "turn-terminal";
  thread.status = "running";

  runtime._ensureProcess = async () => {};
  runtime._streamRun = async () => ({
    answer: "The PowerPoint plugin scratch-generation workflow did not complete.",
    doneEvent: createDoneEvent({
      reason: "presentation_plugin_incomplete",
      answer: "The PowerPoint plugin scratch-generation workflow did not complete.",
    }),
  });

  await runtime._executeTurn("build a deck", "turn-terminal", { modelId: "openrouter:test-model", env: {} });

  assert.equal(thread.status, "idle");
  assert.equal(thread.activeTurnId, null);
  assert.match(thread.lastError, /presentation_plugin_incomplete/);
  assert.match(thread.lastError, /scratch-generation workflow did not complete/);
  assert.equal(thread.messages.at(-1)?.text, "The PowerPoint plugin scratch-generation workflow did not complete.");
  assert.ok(thread.activity.some((entry) => entry.title === "Excelor finished with presentation_plugin_incomplete"));
});

test("abortTurn posts to /abort and clears the active turn locally", async () => {
  const runtime = createRuntime();
  const thread = runtime.bootstrap();
  thread.activeTurnId = "turn-abort";
  thread.status = "running";

  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({ aborted: true }),
    };
  };

  try {
    const snapshot = await runtime.abortTurn("Excelor timed out after 120 seconds of inactivity.");
    assert.equal(snapshot.status, "idle");
    assert.equal(snapshot.activeTurnId, null);
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:27182/abort");
  assert.match(String(calls[0].options.body || ""), /conversationId/);
  assert.match(String(calls[0].options.body || ""), /120 seconds of inactivity/);
  assert.equal(thread.status, "idle");
  assert.equal(thread.activeTurnId, null);
  assert.match(thread.lastError, /120 seconds of inactivity/);
  assert.ok(thread.activity.some((entry) => entry.title === "Excelor run aborted"));
});

test("abortTurn preserves caller-supplied user interruption reasons in snapshot and activity state", async () => {
  const runtime = createRuntime();
  const thread = runtime.bootstrap();
  thread.activeTurnId = "turn-user-stop";
  thread.status = "running";

  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({ aborted: true }),
    };
  };

  try {
    const snapshot = await runtime.abortTurn("Interrupted by user.");
    assert.equal(snapshot.lastError, "Interrupted by user.");
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.match(String(calls[0].options.body || ""), /Interrupted by user\./);
  assert.equal(thread.lastError, "Interrupted by user.");
  assert.ok(thread.activity.some((entry) => entry.title === "Excelor run interrupted" && entry.status === "completed"));
});

test("emitSnapshot persists the current transcript when transcriptPath is configured", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "excelor-runtime-"));
  const transcriptPath = path.join(tempDir, "current-thread.json");

  try {
    const runtime = createRuntime({ transcriptPath });
    const thread = runtime.bootstrap();
    thread.messages.push({
      id: "msg-1",
      role: "user",
      text: "Persist this transcript.",
      createdAt: new Date().toISOString(),
    });
    thread.updatedAt = new Date().toISOString();

    runtime.emitSnapshot();

    const persisted = JSON.parse(fs.readFileSync(transcriptPath, "utf8"));
    assert.equal(persisted.conversationId, runtime.getSnapshot().conversationId);
    assert.equal(persisted.thread.messages.length, 1);
    assert.equal(persisted.thread.messages[0].text, "Persist this transcript.");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("constructor restores a persisted transcript and clears stale running state", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "excelor-runtime-"));
  const transcriptPath = path.join(tempDir, "current-thread.json");

  try {
    fs.writeFileSync(transcriptPath, JSON.stringify({
      version: 1,
      conversationId: "conv-restored",
      thread: {
        id: "excelor-thread-restored",
        status: "running",
        createdAt: "2026-04-14T12:00:00.000Z",
        updatedAt: "2026-04-14T12:00:05.000Z",
        activeTurnId: "turn-123",
        messages: [
          {
            id: "msg-user",
            role: "user",
            text: "Continue the transcript after restart.",
            createdAt: "2026-04-14T12:00:00.000Z",
          },
        ],
        activity: [],
        lastError: "",
        subagents: [],
        subagentPrompts: [],
        skillProposals: [],
        planMode: {
          active: true,
          status: "active",
          revision: 1,
          previousMode: "default",
        },
        planProposals: [],
      },
    }, null, 2), "utf8");

    const runtime = createRuntime({ transcriptPath });
    const snapshot = runtime.getSnapshot();

    assert.equal(snapshot.conversationId, "conv-restored");
    assert.equal(snapshot.status, "idle");
    assert.equal(snapshot.activeTurnId, null);
    assert.equal(snapshot.messages.length, 1);
    assert.equal(snapshot.messages[0].text, "Continue the transcript after restart.");
    assert.match(snapshot.lastError, /Previous run ended before completion\./);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
