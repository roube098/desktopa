/**
 * ExcelorRuntime — HTTP client to the Excelor bun subprocess server.
 * Replaces the previous custom LLM loop with calls to excelor/src/server.ts.
 */
const crypto = require("crypto");
const { EventEmitter } = require("events");
const path = require("path");
const ExcelorProcess = require("./excelor-process");

const DEFAULT_EXCELOR_PORT = parseInt(process.env.EXCELOR_PORT ?? "27182", 10);

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix) {
  if (typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return String(value || "").trim();
}

function shortText(value, max = 280) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function serializeEnv(env = {}) {
  return JSON.stringify(
    Object.entries(env)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

class ExcelorRuntime extends EventEmitter {
  constructor(options = {}) {
    super();
    this.getContext = options.getContext || (() => ({}));
    this.getExecutionConfig = options.getExecutionConfig || (() => ({ modelId: null, env: {} }));
    this.invokeOnlyOfficeTool = options.invokeOnlyOfficeTool || null;
    this.thread = null;
    this.conversationId = newId("conv");
    this.rootDir = options.rootDir || path.resolve(__dirname, "..", "..");
    this.excelorDir = options.excelorDir || path.join(this.rootDir, "excelor");
    this.bundledBunPath = options.bundledBunPath || "";
    this.port = Number.isFinite(options.port) ? Number(options.port) : DEFAULT_EXCELOR_PORT;
    this._process = null;
    this._processReady = false;
    this._processEnvSignature = "";
    this._processError = "";
    this._readyPromise = null;
    this._resolveReadyPromise = null;
    this._rejectReadyPromise = null;
    this._draftAssistantText = "";
  }

  bootstrap() {
    if (!this.thread) {
      this.thread = {
        id: newId("excelor-thread"),
        status: "idle",
        createdAt: nowIso(),
        updatedAt: nowIso(),
        activeTurnId: null,
        messages: [],
        activity: [],
        lastError: "",
        subagents: [],
      };
    }
    return this.thread;
  }

  getSnapshot() {
    return clone({
      ...this.bootstrap(),
      context: this.getContext(),
      draftAssistantText: this._draftAssistantText || "",
    });
  }

  listSubagents() {
    return this.bootstrap().subagents;
  }

  launch(input) {
    this.bootstrap();
    const prompt = normalizeText(input);
    if (!prompt) return this.getSnapshot();
    return this.runTurn(prompt);
  }

  async runTurn(input) {
    const prompt = normalizeText(input);
    if (!prompt) throw new Error("Input is required.");

    const thread = this.bootstrap();
    if (thread.status === "running") throw new Error("Excelor is already processing another turn.");
    const executionConfig = await this._prepareExecutionConfig();

    const turnId = newId("excelor-turn");
    thread.status = "running";
    thread.activeTurnId = turnId;
    thread.lastError = "";
    thread.updatedAt = nowIso();
    thread.messages.push({ id: newId("msg"), role: "user", text: prompt, createdAt: nowIso() });
    this.pushActivity({
      id: newId("act"),
      kind: "status",
      status: "running",
      title: "Excelor is working",
      detail: `Sending request to Excelor using ${executionConfig.providerId}/${executionConfig.modelId}...`,
      createdAt: nowIso(),
    });
    this.emitSnapshot();

    void this._executeTurn(prompt, turnId, executionConfig);
    return this.getSnapshot();
  }

  _createReadyPromise() {
    this._readyPromise = new Promise((resolve, reject) => {
      this._resolveReadyPromise = resolve;
      this._rejectReadyPromise = reject;
    });
  }

  _resolveProcessReady() {
    if (this._resolveReadyPromise) {
      this._resolveReadyPromise();
      this._resolveReadyPromise = null;
      this._rejectReadyPromise = null;
    }
  }

  _rejectProcessReady(error) {
    if (this._rejectReadyPromise) {
      this._rejectReadyPromise(error);
      this._resolveReadyPromise = null;
      this._rejectReadyPromise = null;
    }
  }

  _attachProcess(processInstance) {
    processInstance.on("ready", () => {
      if (this._process !== processInstance) return;

      this._processReady = true;
      this._processError = "";
      this._resolveProcessReady();
      this.pushActivity({
        id: newId("act"),
        kind: "status",
        status: "completed",
        title: "Excelor server ready",
        detail: `http://localhost:${this.port}`,
        createdAt: nowIso(),
      });
      this.emitSnapshot();
    });

    processInstance.on("error", (err) => {
      if (this._process !== processInstance) return;

      this._processReady = false;
      this._processError = err.message;
      this._rejectProcessReady(err);
      const thread = this.bootstrap();
      thread.lastError = err.message;
      this.pushActivity({
        id: newId("act"),
        kind: "status",
        status: "failed",
        title: "Excelor server error",
        detail: err.message,
        createdAt: nowIso(),
      });
      this.emitSnapshot();
    });

    processInstance.on("exit", ({ code, signal }) => {
      if (this._process !== processInstance) return;

      this._processReady = false;
      if (!this._processError) {
        this._rejectProcessReady(new Error(`Excelor server exited before it became ready (code: ${code ?? "null"}, signal: ${signal ?? "null"}).`));
      }
    });
  }

  _startProcess(extraEnv) {
    if (this._process) {
      this._process.stop();
    }

    this._processReady = false;
    this._processError = "";
    this._createReadyPromise();
    this._process = new ExcelorProcess({
      rootDir: this.rootDir,
      excelorDir: this.excelorDir,
      bundledBunPath: this.bundledBunPath,
      port: this.port,
      extraEnv,
    });
    this._attachProcess(this._process);
    this._process.start();
  }

  async _ensureProcess(extraEnv) {
    const nextSignature = serializeEnv(extraEnv);
    if (!this._process || !this._processReady || this._processEnvSignature !== nextSignature) {
      this._processEnvSignature = nextSignature;
      this._startProcess(extraEnv);
    }

    if (this._processReady) {
      return;
    }

    if (this._processError) {
      throw new Error(this._processError);
    }

    await this._readyPromise;
  }

  async _prepareExecutionConfig() {
    let executionConfig;
    try {
      executionConfig = await this.getExecutionConfig();
    } catch (error) {
      this._recordLaunchFailure(error);
      throw error;
    }

    if (!executionConfig || !executionConfig.modelId) {
      const error = new Error("Excelor could not determine which model to use for this run.");
      this._recordLaunchFailure(error);
      throw error;
    }

    try {
      await this._ensureProcess(executionConfig.env || {});
      return executionConfig;
    } catch (error) {
      this._recordLaunchFailure(error);
      throw error;
    }
  }

  _recordLaunchFailure(error) {
    const thread = this.bootstrap();
    const message = error instanceof Error ? error.message : String(error);
    thread.status = "idle";
    thread.activeTurnId = null;
    thread.lastError = message;
    thread.updatedAt = nowIso();
    this.pushActivity({
      id: newId("act"),
      kind: "status",
      status: "failed",
      title: "Excelor launch failed",
      detail: message,
      createdAt: nowIso(),
    });
    this.emitSnapshot();
  }

  async _executeTurn(prompt, turnId, executionConfig) {
    try {
      await this._ensureProcess(executionConfig.env || {});

      const answer = await this._streamRun(prompt, executionConfig.modelId);

      const thread = this.bootstrap();
      if (thread.activeTurnId !== turnId) return; // Stale turn

      thread.messages.push({ id: newId("msg"), role: "assistant", text: answer, createdAt: nowIso() });
      thread.status = "idle";
      thread.activeTurnId = null;
      thread.updatedAt = nowIso();
      this.pushActivity({
        id: newId("act"),
        kind: "status",
        status: "completed",
        title: "Excelor finished",
        detail: "Response ready.",
        createdAt: nowIso(),
      });
      this.emitSnapshot();
    } catch (error) {
      const thread = this.bootstrap();
      thread.status = "idle";
      thread.activeTurnId = null;
      thread.updatedAt = nowIso();
      thread.lastError = error instanceof Error ? error.message : String(error);
      thread.messages.push({
        id: newId("msg"),
        role: "assistant",
        text: `Error: ${thread.lastError}`,
        createdAt: nowIso(),
      });
      this.pushActivity({
        id: newId("act"),
        kind: "status",
        status: "failed",
        title: "Excelor failed",
        detail: thread.lastError,
        createdAt: nowIso(),
      });
      this.emitSnapshot();
    }
  }

  /**
   * POST /run to the Excelor server, consume the SSE stream,
   * translate events to activity entries, return final answer.
   */
  async _streamRun(prompt, modelId) {
    const res = await fetch(`http://localhost:${this.port}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: prompt, conversationId: this.conversationId, model: modelId }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Excelor server error (${res.status}): ${text}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalAnswer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        let event;
        try {
          event = JSON.parse(jsonStr);
        } catch (_) { continue; }

        this._handleAgentEvent(event);
        if (event.type === "done") {
          finalAnswer = event.answer || "";
        }
      }
    }

    return finalAnswer || "Excelor did not return a response.";
  }

  _handleAgentEvent(event) {
    const id = newId("act");
    const createdAt = nowIso();

    switch (event.type) {
      case "thinking":
        this.pushActivity({ id, kind: "thinking", status: "running", title: "Thinking", detail: event.message, createdAt });
        break;
      case "tool_start":
        this.pushActivity({ id, kind: "tool", status: "running", title: `Tool: ${event.tool}`, detail: JSON.stringify(event.args), createdAt });
        break;
      case "tool_end":
        this.pushActivity({ id, kind: "tool", status: "completed", title: `Tool: ${event.tool}`, detail: event.result?.slice?.(0, 300) || "", createdAt });
        break;
      case "tool_error":
        this.pushActivity({ id, kind: "tool", status: "failed", title: `Tool error: ${event.tool}`, detail: event.error, createdAt });
        break;
      case "tool_progress":
        this.pushActivity({ id, kind: "tool", status: "running", title: `Tool: ${event.tool}`, detail: event.message, createdAt });
        break;
      case "context_cleared":
        this.pushActivity({ id, kind: "status", status: "running", title: "Context pruned", detail: `Cleared ${event.clearedCount} old results`, createdAt });
        break;
      case "response_delta":
        this._draftAssistantText = (this._draftAssistantText || "") + (event.delta || "");
        break;
      case "done":
        this._draftAssistantText = "";
        break;
      case "subagent_spawned":
      case "subagent_started":
      case "subagent_message":
      case "subagent_waiting":
      case "subagent_completed":
      case "subagent_failed":
      case "subagent_closed":
        this._handleSubagentLifecycleEvent(event, id, createdAt);
        break;
    }
    this.emitSnapshot();
  }

  _handleSubagentLifecycleEvent(event, activityId, createdAt) {
    const subagent = this._upsertSubagentFromEvent(event);

    switch (event.type) {
      case "subagent_spawned":
        this.pushActivity({
          id: activityId,
          kind: "subagent",
          status: "running",
          title: `Subagent spawned: ${subagent.nickname}`,
          detail: `${subagent.roleName} (depth ${subagent.depth})`,
          createdAt,
          sourceAgentId: subagent.id,
        });
        break;
      case "subagent_started":
        this.pushActivity({
          id: activityId,
          kind: "subagent",
          status: "running",
          title: `Subagent running: ${subagent.nickname}`,
          detail: `${subagent.roleName} started work.`,
          createdAt,
          sourceAgentId: subagent.id,
        });
        break;
      case "subagent_message":
        this.pushActivity({
          id: activityId,
          kind: "subagent",
          status: "running",
          title: `Subagent update: ${subagent.nickname}`,
          detail: shortText(event.message, 320),
          createdAt,
          sourceAgentId: subagent.id,
        });
        break;
      case "subagent_waiting":
        this.pushActivity({
          id: activityId,
          kind: "subagent",
          status: "running",
          title: `Subagent waiting: ${subagent.nickname}`,
          detail: event.reason ? shortText(event.reason, 240) : "Waiting for additional input.",
          createdAt,
          sourceAgentId: subagent.id,
        });
        break;
      case "subagent_completed":
        this.pushActivity({
          id: activityId,
          kind: "subagent",
          status: "completed",
          title: `Subagent completed: ${subagent.nickname}`,
          detail: shortText(event.output, 320),
          createdAt,
          sourceAgentId: subagent.id,
        });
        break;
      case "subagent_failed":
        this.pushActivity({
          id: activityId,
          kind: "subagent",
          status: "failed",
          title: `Subagent failed: ${subagent.nickname}`,
          detail: shortText(event.error, 320),
          createdAt,
          sourceAgentId: subagent.id,
        });
        break;
      case "subagent_closed":
        this.pushActivity({
          id: activityId,
          kind: "subagent",
          status: "completed",
          title: `Subagent closed: ${subagent.nickname}`,
          detail: event.reason ? shortText(event.reason, 240) : "Closed.",
          createdAt,
          sourceAgentId: subagent.id,
        });
        break;
    }
  }

  _upsertSubagentFromEvent(event) {
    const thread = this.bootstrap();
    const existing = thread.subagents.find((agent) => agent.id === event.agent_id);

    const roleLabel = String(event.role || "");
    const roleName = roleLabel
      ? roleLabel.charAt(0).toUpperCase() + roleLabel.slice(1)
      : "Subagent";

    if (!existing) {
      const created = {
        id: event.agent_id,
        nickname: event.nickname || event.agent_id,
        role: roleLabel,
        roleName,
        parentThreadId: event.parent_thread_id || "main",
        depth: typeof event.depth === "number" ? event.depth : 0,
        status: event.status || "idle",
        createdAt: event.at || nowIso(),
        updatedAt: event.at || nowIso(),
        lastActivityAt: event.at || nowIso(),
        lastMessage: "",
        lastOutput: "",
        lastError: "",
        terminalOutcome: "",
      };
      thread.subagents = [...thread.subagents, created];
      return created;
    }

    existing.nickname = event.nickname || existing.nickname;
    existing.role = roleLabel || existing.role;
    existing.roleName = roleName || existing.roleName;
    existing.parentThreadId = event.parent_thread_id || existing.parentThreadId;
    existing.depth = typeof event.depth === "number" ? event.depth : existing.depth;
    existing.status = event.status || existing.status;
    existing.updatedAt = event.at || nowIso();
    existing.lastActivityAt = event.at || nowIso();

    if (event.type === "subagent_message") {
      existing.lastMessage = shortText(event.message, 320);
    }
    if (event.type === "subagent_completed") {
      existing.lastOutput = shortText(event.output, 320);
      existing.terminalOutcome = "completed";
      existing.lastError = "";
    }
    if (event.type === "subagent_failed") {
      existing.lastError = shortText(event.error, 320);
      existing.terminalOutcome = "failed";
    }
    if (event.type === "subagent_closed") {
      existing.terminalOutcome = "closed";
    }

    return existing;
  }

  pushActivity(entry) {
    const thread = this.bootstrap();
    thread.activity = [...thread.activity, entry].slice(-100);
    thread.updatedAt = nowIso();
  }

  emitSnapshot() {
    this.emit("snapshot", this.getSnapshot());
  }

  async resetConversation() {
    this.conversationId = newId("conv");
    this.thread = null;
    this._draftAssistantText = "";
    this.emitSnapshot();
    return this.getSnapshot();
  }

  stop() {
    if (this._process) this._process.stop();
  }
}

module.exports = ExcelorRuntime;
