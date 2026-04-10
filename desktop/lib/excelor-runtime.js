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

const PROVIDER_ENV_NAMES = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
  xai: "XAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  moonshot: "MOONSHOT_API_KEY",
  zai: "ZAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

const PROVIDER_LABELS = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  xai: "xAI",
  deepseek: "DeepSeek",
  moonshot: "Moonshot",
  zai: "Z.AI",
  openrouter: "OpenRouter",
  ollama: "Ollama",
  lmstudio: "LM Studio",
};

const LOCAL_PROVIDER_IDS = new Set(["ollama", "lmstudio"]);

function inferProviderId(executionConfig = {}) {
  const explicitProviderId = normalizeText(executionConfig.providerId).toLowerCase();
  if (explicitProviderId) return explicitProviderId;

  const modelId = normalizeText(executionConfig.modelId);
  if (!modelId) return "";
  if (modelId.startsWith("openrouter:")) return "openrouter";
  if (modelId.startsWith("ollama:")) return "ollama";
  if (modelId.startsWith("zai:")) return "zai";
  if (modelId.startsWith("claude-")) return "anthropic";
  if (modelId.startsWith("gemini-")) return "google";
  if (modelId.startsWith("grok-")) return "xai";
  if (modelId.startsWith("deepseek-")) return "deepseek";
  if (modelId.startsWith("kimi-")) return "moonshot";
  return "openai";
}

function hasConfiguredEnvValue(value) {
  const normalized = normalizeText(value);
  return Boolean(normalized && !normalized.startsWith("your-"));
}

function buildMissingProviderEnvMessage(providerId, envName, modelId) {
  const providerLabel = PROVIDER_LABELS[providerId] || providerId || "the selected provider";
  const normalizedModelId = normalizeText(modelId);
  if (normalizedModelId) {
    return `Excelor requires ${envName} for ${providerLabel} before launching model ${normalizedModelId}.`;
  }
  return `Excelor requires ${envName} for ${providerLabel} before launching this run.`;
}

class ExcelorRuntime extends EventEmitter {
  constructor(options = {}) {
    super();
    this.getContext = options.getContext || (() => ({}));
    this.getExecutionConfig = options.getExecutionConfig || (() => ({ modelId: null, env: {} }));
    this.invokeOnlyOfficeTool = options.invokeOnlyOfficeTool || null;
    this.onOpenGeneratedPptx = typeof options.onOpenGeneratedPptx === "function"
      ? options.onOpenGeneratedPptx
      : null;
    this.onMcpAppToolResult = typeof options.onMcpAppToolResult === "function"
      ? options.onMcpAppToolResult
      : null;
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
    this._pendingSubagentPrompts = new Map();
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
        subagentPrompts: [],
        skillProposals: [],
      };
    }
    return this.thread;
  }

  getSnapshot() {
    return clone({
      ...this.bootstrap(),
      context: this.getContext(),
      draftAssistantText: this._draftAssistantText || "",
      conversationId: this.conversationId,
    });
  }

  listSubagents() {
    return this.bootstrap().subagents;
  }

  async refreshPlugins() {
    if (!this._process || !this._processReady) {
      return { ok: false, reason: "process-not-ready" };
    }

    try {
      const response = await fetch(`http://localhost:${this.port}/plugins/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Plugin refresh failed with status ${response.status}.`);
      }
      return await response.json();
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async abortTurn(reason = "Run cancelled.") {
    const thread = this.bootstrap();
    if (thread.status !== "running" || !thread.activeTurnId) {
      return this.getSnapshot();
    }

    try {
      await fetch(`http://localhost:${this.port}/abort`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: this.conversationId }),
      });
    } catch (_error) {
      // Best effort: clear local state even if the abort request races or the server is already gone.
    }

    thread.status = "idle";
    thread.activeTurnId = null;
    thread.updatedAt = nowIso();
    thread.lastError = reason;
    this._draftAssistantText = "";
    this.pushActivity({
      id: newId("act"),
      kind: "status",
      status: "failed",
      title: "Excelor run aborted",
      detail: reason,
      createdAt: nowIso(),
    });
    this.emitSnapshot();
    return this.getSnapshot();
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
      this._validateExecutionConfig(executionConfig);
    } catch (error) {
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

  _validateExecutionConfig(executionConfig) {
    const providerId = inferProviderId(executionConfig);
    if (!providerId || LOCAL_PROVIDER_IDS.has(providerId)) {
      return;
    }

    const envName = PROVIDER_ENV_NAMES[providerId];
    if (!envName) {
      return;
    }

    if (!hasConfiguredEnvValue(executionConfig.env?.[envName])) {
      throw new Error(buildMissingProviderEnvMessage(providerId, envName, executionConfig.modelId));
    }
  }

  _getTerminalFailure(doneEvent) {
    const payload = this._asRecord(doneEvent);
    const reason = normalizeText(payload?.reason);
    if (!reason || reason === "aborted") {
      return null;
    }

    const answer = normalizeText(payload?.answer);
    return {
      reason,
      answer,
      message: answer ? `${reason}: ${answer}` : reason,
    };
  }

  async _executeTurn(prompt, turnId, executionConfig) {
    try {
      await this._ensureProcess(executionConfig.env || {});

      const finalRun = await this._streamRun(prompt, executionConfig.modelId);
      const answer = finalRun.answer;
      const terminalFailure = this._getTerminalFailure(finalRun.doneEvent);

      const thread = this.bootstrap();
      if (thread.activeTurnId !== turnId) return; // Stale turn

      await this._maybeOpenGeneratedPptx(finalRun.doneEvent);

      thread.messages.push({ id: newId("msg"), role: "assistant", text: answer, createdAt: nowIso() });
      thread.status = "idle";
      thread.activeTurnId = null;
      thread.updatedAt = nowIso();
      if (terminalFailure) {
        thread.lastError = terminalFailure.message;
        this.pushActivity({
          id: newId("act"),
          kind: "status",
          status: "failed",
          title: `Excelor finished with ${terminalFailure.reason}`,
          detail: terminalFailure.answer || terminalFailure.reason,
          createdAt: nowIso(),
        });
      } else {
        this.pushActivity({
          id: newId("act"),
          kind: "status",
          status: "completed",
          title: "Excelor finished",
          detail: "Response ready.",
          createdAt: nowIso(),
        });
      }
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
   * translate events to activity entries, and retain the final done event.
   */
  async _streamRun(prompt, modelId) {
    const desktopContext = this.getContext();
    const res = await fetch(`http://localhost:${this.port}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: prompt,
        conversationId: this.conversationId,
        model: modelId,
        desktopContext,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Excelor server error (${res.status}): ${text}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalAnswer = "";
    let finalDoneEvent = null;

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
          finalDoneEvent = event;
        }
      }
    }

    return {
      answer: finalAnswer || "Excelor did not return a response.",
      doneEvent: finalDoneEvent,
    };
  }

  _asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : null;
  }

  _normalizeFormat(value) {
    const normalized = normalizeText(value).toLowerCase();
    if (normalized === "ppt") return "pptx";
    return normalized;
  }

  _parseToolCallResult(result) {
    if (typeof result === "string") {
      try {
        return this._asRecord(JSON.parse(result));
      } catch (_error) {
        return null;
      }
    }
    return this._asRecord(result);
  }

  _captureSubagentPromptFromToolEvent(event) {
    const toolName = normalizeText(event?.tool).toLowerCase();
    if (toolName !== "spawn_agent" && toolName !== "send_input") {
      return;
    }

    const args = this._asRecord(event?.args) || {};
    const taskPrompt = normalizeText(args.input);
    if (!taskPrompt) {
      return;
    }

    const parsedResult = this._parseToolCallResult(event?.result);
    if (!parsedResult) {
      return;
    }

    if (parsedResult.ok === false) {
      return;
    }

    const agentId = normalizeText(parsedResult.agent_id);
    if (!agentId) {
      return;
    }

    this._recordSubagentPromptAssignment({
      agentId,
      taskPrompt,
      toolName,
      createdAt: this._resolveSubagentPromptTimestamp(agentId, toolName, event),
    });
    this._setSubagentTaskPrompt(agentId, taskPrompt);
  }

  _extractMcpAppToolPayload(event) {
    const parsedResult = this._parseToolCallResult(event?.result);
    const payload = this._asRecord(parsedResult?.data);
    const appSession = this._asRecord(payload?.appSession);
    if (!payload || !appSession) {
      return null;
    }

    const sessionId = normalizeText(appSession.sessionId);
    const resourceUri = normalizeText(appSession.resourceUri);
    if (!sessionId || !resourceUri) {
      return null;
    }

    return {
      toolName: normalizeText(event?.tool),
      toolArguments: this._asRecord(event?.args) || {},
      connector: this._asRecord(payload.connector) || {},
      remoteToolName: normalizeText(payload.remoteToolName) || normalizeText(event?.tool),
      appSession: {
        ...appSession,
        sessionId,
        resourceUri,
      },
      content: Array.isArray(payload.content) ? payload.content : [],
      structuredContent: payload.structuredContent,
      meta: this._asRecord(payload.meta) || undefined,
    };
  }

  async _maybeHandleMcpAppToolResult(event) {
    if (!this.onMcpAppToolResult) {
      return;
    }

    const payload = this._extractMcpAppToolPayload(event);
    if (!payload) {
      return;
    }

    try {
      await this.onMcpAppToolResult(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.pushActivity({
        id: newId("act"),
        kind: "status",
        status: "failed",
        title: "Failed to open MCP app",
        detail: shortText(message, 320),
        createdAt: nowIso(),
      });
    }
  }

  _resolveSubagentPromptTimestamp(agentId, toolName, event) {
    const explicitTimestamp = normalizeText(event?.at);
    if (explicitTimestamp) {
      return explicitTimestamp;
    }

    const thread = this.bootstrap();
    const existing = thread.subagents.find((agent) => agent.id === agentId);
    if (toolName === "spawn_agent" && existing?.createdAt) {
      return existing.createdAt;
    }

    return nowIso();
  }

  _recordSubagentPromptAssignment({ agentId, taskPrompt, toolName, createdAt }) {
    const normalizedAgentId = normalizeText(agentId);
    const normalizedPrompt = normalizeText(taskPrompt);
    const normalizedToolName = normalizeText(toolName).toLowerCase();
    const normalizedCreatedAt = normalizeText(createdAt) || nowIso();
    if (!normalizedAgentId || !normalizedPrompt) {
      return;
    }
    if (normalizedToolName !== "spawn_agent" && normalizedToolName !== "send_input") {
      return;
    }

    const thread = this.bootstrap();
    thread.subagentPrompts = [
      ...thread.subagentPrompts,
      {
        id: newId("subprompt"),
        agentId: normalizedAgentId,
        prompt: normalizedPrompt,
        createdAt: normalizedCreatedAt,
        toolName: normalizedToolName,
        conversationId: this.conversationId,
      },
    ];
    thread.updatedAt = nowIso();
  }

  _setSubagentTaskPrompt(agentId, taskPrompt) {
    const normalizedAgentId = normalizeText(agentId);
    const normalizedPrompt = normalizeText(taskPrompt);
    if (!normalizedAgentId || !normalizedPrompt) {
      return;
    }

    const thread = this.bootstrap();
    const existing = thread.subagents.find((agent) => agent.id === normalizedAgentId);
    if (!existing) {
      this._pendingSubagentPrompts.set(normalizedAgentId, normalizedPrompt);
      return;
    }

    existing.taskPrompt = normalizedPrompt;
    existing.updatedAt = nowIso();
    existing.lastActivityAt = nowIso();
    this._pendingSubagentPrompts.delete(normalizedAgentId);
  }

  _findGeneratedPptxPath(doneEvent) {
    const payload = this._asRecord(doneEvent);
    const toolCalls = Array.isArray(payload?.toolCalls) ? payload.toolCalls : [];
    const pptxOutputTools = new Set(["createFile", "compilePresentationSlides", "packPresentationTemplate"]);

    for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
      const toolCall = this._asRecord(toolCalls[index]);
      if (!pptxOutputTools.has(normalizeText(toolCall?.tool))) continue;

      const args = this._asRecord(toolCall?.args) || {};
      const result = this._parseToolCallResult(toolCall?.result);
      if (!result || result.success !== true) continue;

      const data = this._asRecord(result.data) || {};
      const format = this._normalizeFormat(data.format || args.format);
      if (format !== "pptx") continue;

      if (args.open === false || data.open === false) {
        return null;
      }

      const absolutePath = normalizeText(data.absolutePath);
      const workspacePath = normalizeText(data.workspacePath);
      const candidatePath = absolutePath || workspacePath;
      return candidatePath ? path.resolve(candidatePath) : null;
    }

    return null;
  }

  async _maybeOpenGeneratedPptx(doneEvent) {
    if (!this.onOpenGeneratedPptx) {
      return;
    }

    const payload = this._asRecord(doneEvent);
    if (!payload || normalizeText(payload.reason)) {
      return;
    }

    const targetPath = this._findGeneratedPptxPath(payload);
    if (!targetPath) {
      return;
    }

    const fileName = path.basename(targetPath);
    try {
      await this.onOpenGeneratedPptx(targetPath);
      this.pushActivity({
        id: newId("act"),
        kind: "status",
        status: "completed",
        title: "Opened presentation in ONLYOFFICE",
        detail: fileName,
        createdAt: nowIso(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.pushActivity({
        id: newId("act"),
        kind: "status",
        status: "failed",
        title: "Failed to open generated presentation",
        detail: shortText(`${fileName}: ${message}`, 320),
        createdAt: nowIso(),
      });
    }
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
        this._captureSubagentPromptFromToolEvent(event);
        void this._maybeHandleMcpAppToolResult(event);
        this.pushActivity({ id, kind: "tool", status: "completed", title: `Tool: ${event.tool}`, detail: event.result?.slice?.(0, 300) || "", createdAt });
        break;
      case "tool_error":
        this.pushActivity({ id, kind: "tool", status: "failed", title: `Tool error: ${event.tool}`, detail: event.error, createdAt });
        break;
      case "tool_approval":
        this.pushActivity({
          id,
          kind: "tool",
          status: event.approved === "deny" ? "failed" : "completed",
          title: `Tool approval: ${event.tool}`,
          detail: `Decision: ${event.approved}${event.args?.path ? ` | path: ${event.args.path}` : ""}`,
          createdAt,
        });
        break;
      case "tool_denied":
        this.pushActivity({
          id,
          kind: "tool",
          status: "failed",
          title: `Tool denied: ${event.tool}`,
          detail: event.args?.path ? `Path: ${event.args.path}` : JSON.stringify(event.args || {}),
          createdAt,
        });
        break;
      case "tool_progress":
        this.pushActivity({ id, kind: "tool", status: "running", title: `Tool: ${event.tool}`, detail: event.message, createdAt });
        break;
      case "context_cleared":
        this.pushActivity({ id, kind: "status", status: "running", title: "Context pruned", detail: `Cleared ${event.clearedCount} old results`, createdAt });
        break;
      case "compact": {
        const preTokens = Number.isFinite(event.preTokens) ? Number(event.preTokens) : 0;
        const postTokens = Number.isFinite(event.postTokens) ? Number(event.postTokens) : 0;
        const reduction = preTokens > 0
          ? Math.max(0, Math.round((1 - postTokens / preTokens) * 100))
          : 0;
        this.pushActivity({
          id,
          kind: "status",
          status: "completed",
          title: "Context compacted",
          detail: `Replaced prior tool context with a summary (${preTokens.toLocaleString()} -> ${postTokens.toLocaleString()} tokens, ${reduction}% smaller)`,
          createdAt,
        });
        break;
      }
      case "response_delta":
        this._draftAssistantText = (this._draftAssistantText || "") + (event.delta || "");
        break;
      case "done":
        this._draftAssistantText = "";
        break;
      case "skill_reflection":
        this.pushActivity({
          id,
          kind: "skill_reflection",
          status: "completed",
          title: "Skill reflection",
          detail: event.message,
          createdAt,
        });
        break;
      case "skill_proposal": {
        const thread = this.bootstrap();
        const proposalEntry = {
          id: newId("skill-prop"),
          proposalId: event.proposalId,
          action: event.action,
          name: event.name,
          description: event.description,
          body: event.body,
          skillNameToUpdate: event.skillNameToUpdate || "",
          createdAt,
          status: "pending",
        };
        thread.skillProposals = [...(thread.skillProposals || []), proposalEntry];
        this.pushActivity({
          id,
          kind: "skill_proposal",
          status: "pending",
          title: `Skill proposal: ${event.name}`,
          detail: event.description,
          createdAt,
          proposalId: event.proposalId,
        });
        break;
      }
      case "skills_changed":
        this.emit("skills-changed");
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
          subagentEventType: event.type,
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
          subagentEventType: event.type,
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
          subagentEventType: event.type,
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
          subagentEventType: event.type,
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
          subagentEventType: event.type,
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
          subagentEventType: event.type,
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
          subagentEventType: event.type,
        });
        break;
    }
  }

  _upsertSubagentFromEvent(event) {
    const thread = this.bootstrap();
    const existing = thread.subagents.find((agent) => agent.id === event.agent_id);
    const pendingTaskPrompt = this._pendingSubagentPrompts.get(event.agent_id);

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
        taskPrompt: pendingTaskPrompt || undefined,
        conversationId: this.conversationId,
      };
      thread.subagents = [...thread.subagents, created];
      this._pendingSubagentPrompts.delete(event.agent_id);
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
    if (pendingTaskPrompt) {
      existing.taskPrompt = pendingTaskPrompt;
      this._pendingSubagentPrompts.delete(event.agent_id);
    }

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

  resolveSkillProposal(proposalId, options = {}) {
    const normalizedProposalId = normalizeText(proposalId);
    if (!normalizedProposalId) {
      return this.getSnapshot();
    }

    const thread = this.bootstrap();
    const proposals = Array.isArray(thread.skillProposals) ? thread.skillProposals : [];
    const resolvedProposal = proposals.find(
      (proposal) => normalizeText(proposal?.proposalId) === normalizedProposalId,
    );
    if (!resolvedProposal) {
      return this.getSnapshot();
    }

    thread.skillProposals = proposals.filter(
      (proposal) => normalizeText(proposal?.proposalId) !== normalizedProposalId,
    );

    const resolution = normalizeText(options?.resolution).toLowerCase() === "rejected"
      ? "rejected"
      : "accepted";
    const createdAt = nowIso();
    const proposalName = normalizeText(options?.name) || normalizeText(resolvedProposal.name) || "proposal";
    const detail = normalizeText(options?.detail) || normalizeText(resolvedProposal.description);

    this.pushActivity({
      id: newId("act"),
      kind: "skill_proposal",
      status: resolution === "accepted" ? "completed" : "failed",
      title: resolution === "accepted"
        ? `Skill approved: ${proposalName}`
        : `Skill rejected: ${proposalName}`,
      detail,
      createdAt,
      proposalId: normalizedProposalId,
    });

    if (resolution === "accepted" && options?.emitSkillsChanged !== false) {
      this.emit("skills-changed");
    }

    this.emitSnapshot();
    return this.getSnapshot();
  }

  async resetConversation() {
    this.conversationId = newId("conv");
    this.thread = null;
    this._draftAssistantText = "";
    this._pendingSubagentPrompts.clear();
    this.emitSnapshot();
    return this.getSnapshot();
  }

  stop() {
    if (this._process) this._process.stop();
  }
}

module.exports = ExcelorRuntime;
