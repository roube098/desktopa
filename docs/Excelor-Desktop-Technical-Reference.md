# Excelor desktop technical reference

**Not technical?** Start with the plain-language overview: [Excelor-Introduction-Public.md](./Excelor-Introduction-Public.md).

Markdown companion to [`../output/pdf/Excelor-Technical-Deep-Dive.pdf`](../output/pdf/Excelor-Technical-Deep-Dive.pdf). Focus: **desktop** package (main process, preload IPC, renderer, local services). For exhaustive agent tools and platform features, see [EXCELOR_CAPABILITIES.md](../EXCELOR_CAPABILITIES.md) at the repository root.

**Package:** excelor v1.0.0 (`desktop/package.json`) - MIT.

---

## 1. Layered architecture

The UI is an Electron app. The **renderer** (Vite + React) does not call cloud LLMs directly for agent turns; it uses IPC handlers that proxy to a local **ExcelorRuntime** HTTP client. The Bun server (Dexter) exposes SSE streams, tool execution, and scratchpad logging.

```text
+-------------------+     +----------------------+     +------------------+
|  Renderer (React) |---->|  Main + preload IPC  |---->| Excelor HTTP     |
|  assistant-ui     |     |  excelor-runtime.js  |     | localhost :27182 |
|  Zustand, Tailwind|     |  DockerManager, OO   |     | (default)        |
+-------------------+     +----------------------+     +------------------+
         |                           |                          |
         |                           v                          v
         |                  +----------------+          +---------------+
         |                  | WebContentsView|          | Bun agent     |
         |                  | embedded browser          | /run SSE      |
         |                  +----------------+          +---------------+
         v                           |
+-------------------+                v
| OnlyOffice iframe |<---- URL bridge / editor handshake
| workspace files   |
+-------------------+
```

### 1.1 Default ports and scopes

| Variable / scope | Default | Role |
|------------------|---------|------|
| EXCELOR_PORT / main scope | 27182 | Primary agent runtime for main UI thread |
| EXCELOR_ONLYOFFICE_PORT / onlyoffice scope | 27183 | Separate runtime bound to editor context |
| Backend / OnlyOffice (UI status) | 8090 / 8080 | Shown in App.tsx initial ports until resolved |

---

## 2. Electron main process responsibilities

`main.js` owns BrowserWindow, optional WebContentsView for embedded browsing, tray integration, Docker lifecycle for OnlyOffice, workspace file IO under the user Documents path, PDF text extraction via pdf-parse, and all `ipcMain` handlers exposed through preload.

### 2.1 Workspace and OnlyOffice

Workspace root defaults to `Documents/My Workspace`. OnlyOffice container name `spreadsheet-ai-onlyoffice`; example files path bridges host Docker paths to editor URLs. Supported extensions include office formats, PDF, CSV, Markdown, and plain text.

### 2.2 ExcelorRuntime (`desktop/lib/excelor-runtime.js`)

Wraps HTTP calls to the Bun server: bootstrap, run-turn, launch, abort, list subagents, update context. Injects provider API keys from environment (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `XAI_API_KEY`, `DEEPSEEK_API_KEY`, `MOONSHOT_API_KEY`, `ZAI_API_KEY`, `OPENROUTER_API_KEY`) when launching the subprocess. Infers provider from model id prefixes (`claude-`, `gemini-`, `grok-`, etc.).

---

## 3. Preload IPC surface (`electronAPI`)

`contextBridge` exposes a stable API to the renderer. Channel names grouped by concern.

### 3.1 Services and lifecycle

| Channel | Type | Purpose |
|---------|------|---------|
| get-status | invoke | Backend / OnlyOffice status |
| get-ports | invoke | Resolved ports including editor bridge |
| restart-services | invoke | Restart local services |
| service-status, ports-resolved, services-ready, service-error | on | Push status to renderer |

### 3.2 Embedded browser

| Channel | Type | Purpose |
|---------|------|---------|
| browser-show | invoke | Position WebContentsView with bounds |
| browser-hide | invoke | Hide embedded browser |
| browser-navigate, browser-load-excelor, browser-go-back, browser-go-forward | invoke | Navigation |
| browser-reload, browser-stop, browser-open-external | invoke | Reload / stop / system browser |
| browser-state-changed | on | URL and loading state |

### 3.3 Excelor agent bridge

| Channel | Type | Purpose |
|---------|------|---------|
| excelor-bootstrap | invoke | Scope-aware bootstrap |
| excelor-run-turn, excelor-launch, excelor-abort-turn | invoke | Turn execution and cancel |
| excelor-list-subagents | invoke | Subagent listing |
| excelor-update-context | invoke | Document / editor context for prompts |
| excelor-snapshot | on | Streaming state to UI |
| excelor-apply-subagent-tool / respondExcelorSubagentTool | on / send | Subagent tool round-trip |

### 3.4 Workspace files

| Channel | Kind |
|---------|------|
| list-workspace-files, create-workspace-file, open-workspace-file | invoke |
| workspace-files-changed | on |

### 3.5 Providers and models

Invoke handlers for multi-provider configuration, OAuth for OpenAI, API key storage, and model selection (see Appendix-style list in `desktop/preload.js`: get-provider-settings, get-provider-meta, set-active-provider, connect-provider, disconnect-provider, update-provider-model, validate-api-key, fetch-provider-models, store-api-key, get-active-provider-config, login-openai-with-chatgpt).

### 3.6 Skills and plugins

- Skills: get-skills, set-skill-enabled, resync-skills, get-skill-tree, read-skill-file, open-skill-in-editor, show-skill-in-folder, skills-changed.
- Plugins: get-plugins, set-plugin-enabled, resync-plugins, get-plugin-tree, read-plugin-file, open-plugin-in-editor, show-plugin-in-folder.

### 3.7 MCP and financial connectors

- MCP: get-mcp-connectors, add-mcp-connector, delete-mcp-connector, set-mcp-connector-enabled, check-mcp-connector, disconnect-mcp-connector.
- Financial: get-financial-settings, update-financial-settings, get-financial-mcp-providers, connect-financial-mcp-provider, disconnect-financial-mcp-provider, check-financial-mcp-provider, sync-financial-mcp-providers.

### 3.8 PDF helpers

open-pdf-in-onlyoffice, pdf:extractText, pdf:extractTextFromBuffer (base64) for chat context.

### 3.9 Local LLM tests and custom models

test-ollama-connection, test-lmstudio-connection, get-custom-models, add-custom-model, remove-custom-model, get-merged-models.

---

## 4. Agent runtime HTTP (Bun server)

| Method | Path | Purpose |
|--------|------|---------|
| POST | /run | Agent turn with SSE event stream |
| GET | /health | Health |
| POST | /abort | Cancel run |
| POST | /editor/tool | Tools that need editor coupling |
| POST | /plugins/refresh | Hot-reload plugins |

### 4.1 Representative SSE event types

| Event | Meaning |
|-------|---------|
| thinking | Reasoning step |
| tool_start / tool_end / tool_error / tool_progress | Tool lifecycle |
| tool_approval / tool_denied | Human approval gates |
| response_delta | Final answer tokens |
| context_cleared / compact | Compaction |
| subagent_spawned / subagent_closed | Subagents |
| done | Turn complete with metadata |

---

## 5. Agent loop and memory (runtime)

Iterative tool-calling loop: load registry, system prompt (soul, skills, desktop context), stream model, execute tools, write scratchpad JSONL under `.excelor/scratchpad/`, apply micro-compaction and auto-compaction when context exceeds thresholds. Default max iterations: unbounded (Infinity) until natural completion.

### 5.1 Subagents

Tools: spawn_agent, send_input, resume_agent, wait, close_agent. Limits: max 6 concurrent subagent threads, nesting depth 1 (no nested spawn from subagents).

### 5.2 Filesystem tool sandbox (runtime)

Workspace root from `EXCELOR_WORKSPACE_DIR` or cwd; paths must stay under root; symlink components rejected; read_file line limits and size caps apply.

---

## 6. Renderer application structure

`App.tsx` composes Titlebar, Dashboard, LeftSidebar, MyThread (assistant-ui runtime), embedded browser host, OnlyOffice iframe, Settings. `centerMode` switches: dashboard, browser, editor, settings. Streaming: `streamExcelorAssistantTurn` bridges SSE into assistant-ui adapters.

Attachments: CompositeAttachmentAdapter with image, text, and PDF adapter for context.

---

## 7. LLM providers (platform overview)

UI may list many providers; agent runtime wiring in desktop focuses on env-injected keys for OpenAI-class providers plus Ollama/OpenRouter. Full matrix in product docs.

| Provider | Routing hint | Notes |
|----------|----------------|-------|
| OpenAI | default | gpt-*, o*, etc. |
| Anthropic | claude- prefix | Prompt cache supported in runtime |
| Google | gemini- prefix | |
| xAI | grok- prefix | |
| DeepSeek | deepseek- prefix | |
| Moonshot | kimi- prefix | |
| Z.AI | zai: prefix | |
| OpenRouter | openrouter: prefix | Proxy to many models |
| Ollama | ollama: prefix | Local |
| Others | Bedrock, Vertex, Azure, LM Studio, LiteLLM | Often via UI or gateway paths |

---

## 8. Agent tool domains (summary)

Tools are assembled dynamically. Major domains: financial research (financialdatasets.ai API), Yahoo via yfinance worker, web search (Exa, Perplexity, Tavily by key priority), web_fetch with Readability, X search, browser (Playwright or desktop bridge), filesystem read/write/edit, spreadsheet (openpyxl), Word and PPTX pipelines, PDF manipulation, WhatsApp send_whatsapp, heartbeat, skill invoker.

### 8.1 Browser tool and desktop bridge

When `EXCELOR_BROWSER_BRIDGE_URL` is set, browser automation targets the Electron bridge; otherwise Playwright launches Chromium. Actions include navigate, snapshot, act (click, type, press, hover, scroll, wait), read, close.

---

## 9. WhatsApp gateway (separate process)

Baileys-based gateway: `bun run gateway`, session in `~/.excelor/credentials/whatsapp/default/`, config `~/.excelor/gateway.json` (allowFrom, groupPolicy, groupAllowFrom). Inbound routing via resolve-route; outbound send_whatsapp uses bridge URL and `x-excelor-whatsapp-token` header.

### 9.1 Heartbeat file

Agent heartbeat tool reads/writes `~/.excelor/HEARTBEAT.md` for persistent checklists.

---

## 10. Build and development

| Script | Purpose |
|--------|---------|
| npm run dev:vite | Vite dev server |
| npm run dev:electron | Electron with VITE_DEV_SERVER_URL |
| npm run build | vite build && electron-builder --win |
| npm run test:unit | Node test runner on tests/*.test.js |
| npm run typecheck | tsc --noEmit |

Key dependencies: electron 33, react 19, vite 7, tailwind 4, @assistant-ui/react, electron-store, node-pty, pdf-parse, framer-motion, zustand.

---

## Appendix A. ipcMain.handle channel index

Alphabetical list of **invoke** handlers registered in `desktop/main.js`. Renderer events without a return value use `ipcMain.on` instead (for example minimize-window, maximize-window, close-window, excelor-close, excelor-subagent-tool-result).

Keep in sync with `IPC_MAIN_HANDLES_SORTED` in `scripts/generate-excelor-technical-deep-dive.py` and `desktop/main.js`.

| ipcMain.handle channel |
|------------------------|
| add-custom-model |
| add-mcp-connector |
| browser-go-back |
| browser-go-forward |
| browser-hide |
| browser-load-excelor |
| browser-navigate |
| browser-open-external |
| browser-reload |
| browser-show |
| browser-stop |
| check-financial-mcp-provider |
| check-mcp-connector |
| connect-financial-mcp-provider |
| connect-provider |
| create-workspace-file |
| delete-mcp-connector |
| disconnect-financial-mcp-provider |
| disconnect-mcp-connector |
| disconnect-provider |
| excelor-abort-turn |
| excelor-bootstrap |
| excelor-launch |
| excelor-list-subagents |
| excelor-run-turn |
| excelor-update-context |
| fetch-provider-models |
| get-active-provider-config |
| get-custom-models |
| get-financial-mcp-providers |
| get-financial-settings |
| get-merged-models |
| get-mcp-connectors |
| get-plugin-tree |
| get-plugins |
| get-ports |
| get-provider-meta |
| get-provider-settings |
| get-skill-tree |
| get-skills |
| get-status |
| list-workspace-files |
| login-openai-with-chatgpt |
| open-pdf-in-onlyoffice |
| open-plugin-in-editor |
| open-skill-in-editor |
| open-workspace-file |
| pdf:extractText |
| pdf:extractTextFromBuffer |
| read-plugin-file |
| read-skill-file |
| remove-custom-model |
| resync-plugins |
| resync-skills |
| restart-services |
| set-active-provider |
| set-mcp-connector-enabled |
| set-plugin-enabled |
| set-skill-enabled |
| show-plugin-in-folder |
| show-skill-in-folder |
| store-api-key |
| sync-financial-mcp-providers |
| test-lmstudio-connection |
| test-ollama-connection |
| update-financial-settings |
| update-provider-model |
| validate-api-key |

---

For full tool registry and narrative features, see [EXCELOR_CAPABILITIES.md](../EXCELOR_CAPABILITIES.md).
