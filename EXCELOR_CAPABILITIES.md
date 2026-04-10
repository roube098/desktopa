# Excelor — Complete Capabilities Reference

## What is Excelor?

Excelor is a **self-evolving AI agent platform** that combines an autonomous agent runtime, a full document workspace, browser automation, WhatsApp messaging, and a plugin ecosystem — all running locally on your machine. It is not a chatbot. It is an execution engine: agents that research, trade, automate, communicate, build tools, and improve themselves without waiting for human input at every step.

The platform ships as an **Electron desktop application** backed by a **Bun/TypeScript agent server** (codenamed Dexter), a **Docker-based OnlyOffice** suite for real-time document editing, a **WhatsApp gateway** for messaging, and a growing library of **plugins and skills** that extend its reach into any domain.

---

## Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     DESKTOP UI LAYER                        │
│  Electron  •  React 19  •  Tailwind 4  •  Framer Motion    │
│  @assistant-ui/react  •  Zustand  •  Radix UI              │
│  Workspace File Mentions  •  Plugin Panel  •  Subagent UI  │
├─────────────────────────────────────────────────────────────┤
│                    AGENT RUNTIME (Bun)                       │
│  TypeScript  •  SSE Streaming  •  Tool Registry             │
│  Scratchpad  •  Context Management  •  Subagent System      │
│  Hook System  •  Plugin Runtime  •  Eval Framework          │
├─────────────────────────────────────────────────────────────┤
│                    GATEWAY LAYER                             │
│  WhatsApp (Baileys)  •  Session Routing  •  Group Support   │
│  Heartbeat Runner  •  Channel Plugin Architecture           │
├─────────────────────────────────────────────────────────────┤
│                   DOCUMENT ENGINE                            │
│  OnlyOffice (Docker)  •  Flask Backend                      │
│  XLSX / DOCX / PPTX / PDF — native editing & generation    │
├─────────────────────────────────────────────────────────────┤
│                    LLM PROVIDERS                             │
│  OpenAI  •  Anthropic  •  Google  •  xAI  •  DeepSeek      │
│  Moonshot  •  Z.AI  •  OpenRouter  •  Ollama  •  LM Studio │
│  MiniMax  •  AWS Bedrock  •  Vertex AI  •  Azure Foundry   │
│  LiteLLM                                                    │
└─────────────────────────────────────────────────────────────┘
```

**Local-first:** The agent runtime runs on `localhost` (port 27182). No data leaves your machine unless you choose a cloud LLM provider. Ollama and LM Studio provide fully air-gapped operation.

**Communication:** The desktop app communicates with the agent runtime over HTTP + Server-Sent Events (SSE). Every tool call, thinking step, and result streams to the UI in real time.

**Runtime HTTP Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/run` | POST | Execute an agent turn (SSE response) |
| `/health` | GET | Health check |
| `/editor/tool` | POST | Bridge for editor-bound tools |
| `/plugins/refresh` | POST | Hot-reload plugins |
| `/abort` | POST | Cancel a running turn |

---

## Autonomous Agent System

### Agent Loop

The core agent lives in `src/agent/agent.ts`. It operates as an iterative tool-calling loop:

1. Receive a user query
2. Initialize plugin runtime (`ensurePluginRuntimeReady`)
3. Load tools from registry (model-aware, channel-aware, with subagent manager)
4. Load soul document and build system prompt (persona, soul, channel context, desktop context, subagent prompts, enabled skill/command blocks)
5. Stream a model call — the LLM decides which tools to invoke
6. Execute tools via `tool-executor.ts`, store results in the scratchpad
7. Manage context (micro-compact older results, auto-compact if needed)
8. Inject subagent notifications if sub-agents have updates
9. Repeat until the agent decides to produce a final answer
10. Generate the final answer in a separate LLM call (no tools bound) with full scratchpad context

There is **no fixed iteration cap** (`DEFAULT_MAX_ITERATIONS = Infinity`) — the agent runs until it completes the task or hits a natural stopping point.

### Real-Time Events

The agent emits typed events throughout its execution, streamed to the UI via SSE:

| Event | Meaning |
|-------|---------|
| `thinking` | The agent is reasoning |
| `tool_start` | A tool invocation has begun |
| `tool_end` | A tool has returned a result |
| `tool_error` | A tool failed |
| `tool_progress` | Progress update from a long-running tool |
| `tool_approval` | Tool requires user approval |
| `tool_denied` | User denied tool execution |
| `response_delta` | Streaming token from the final answer |
| `context_cleared` | Micro-compaction occurred |
| `compact` | Full LLM compaction occurred |
| `subagent_spawned` | A sub-agent was created |
| `subagent_closed` | A sub-agent finished |
| `done` | Turn complete with answer, tool calls, iterations, token usage, timing |

### Context Management

Excelor uses a multi-layered system to keep prompt context within model limits while preserving critical working memory:

- **Per-result capping:** Individual tool outputs exceeding 50,000 characters are truncated to a 2,000-character preview. Full output is persisted to `.excelor/tool-results/` for later retrieval.
- **Micro-compaction:** When context exceeds a fixed token estimate threshold (`text.length / 3.5`), older tool results are replaced with one-line `[Compressed]` summaries while recent results (`KEEP_TOOL_USES`) stay in full.
- **Auto-compaction:** When context exceeds a model-aware threshold (preferring real API `inputTokens` counts), the entire scratchpad is replaced with a structured LLM summary preserving primary intent, key findings, tool calls, errors, pending tasks, and next step.
- **Overflow recovery:** If the provider still rejects a request, the agent retries with `OVERFLOW_KEEP_TOOL_USES` (more aggressive), then full auto-compact, up to `MAX_OVERFLOW_RETRIES = 2`.
- **Post-compact restoration:** After full compaction, lightweight runtime hints (desktop editor context, recent tool names, thread metadata) are re-injected on top of the summary.

### Scratchpad

Every agent run creates a persistent JSONL log under `.excelor/scratchpad/`. Entry types:

| Entry Type | Purpose |
|------------|---------|
| `init` | Session start |
| `tool_result` | Every tool call and its output |
| `thinking` | Reasoning steps |
| `compact_summary` | Compaction checkpoints |
| `presentation_plugin` | Presentation generation state |
| `presentation_plugin_cleanup` | Presentation cleanup state |
| `terminal` | Session end |

The scratchpad is the single source of truth for a run. It supports debugging, replay, and audit. Tool call frequency is soft-limited (default 3 calls per tool with warning, similarity threshold 0.7 for repeat queries).

### Multi-Turn Chat History

Separate from the scratchpad, `in-memory-chat-history.ts` manages previous user/assistant turns across queries. The scratchpad handles within-run context; chat history handles cross-run conversation.

---

## Sub-Agent System

Excelor agents can **spawn specialized sub-agents** to delegate complex tasks:

| Tool | Parameters | Purpose |
|------|-----------|---------|
| `spawn_agent` | `role`, `input`, `nickname`, `model`, `parent_thread_id` | Create a role-specialized sub-agent |
| `send_input` | `agent_id`, `input` | Send instructions to a running sub-agent |
| `resume_agent` | `agent_id` | Resume a waiting or idle sub-agent |
| `wait` | `agent_id`, `timeout_seconds` (10–3600s, default 30) | Wait for a sub-agent to complete |
| `close_agent` | `agent_id`, `reason` | Gracefully close a sub-agent |

**Limits:** Maximum **6 concurrent sub-agent threads**, maximum nesting **depth of 1** (sub-agents cannot spawn their own sub-agents). Dynamic role list is provided by the subagent manager.

Sub-agents run their own tool loops with their own scratchpads. The parent agent coordinates, delegates, and synthesizes their results. The desktop UI renders inline **subagent cards** showing status pills, role, depth, expandable prompt/activity, and summaries for running/waiting/completed/failed/closed states.

---

## WhatsApp Messaging Gateway

Excelor includes a full **WhatsApp integration** that turns the agent into a conversational assistant accessible from your phone.

### Gateway Architecture

The WhatsApp gateway is built on **Baileys** (`@whiskeysockets/baileys`) — a lightweight WhatsApp Web API. It runs as a Bun process with:

- **Session management** — persistent sessions stored in `~/.excelor/credentials/whatsapp/default/`
- **Inbound message routing** — messages are routed through `routing/resolve-route.js` to the appropriate agent session
- **Outbound messaging** — `outbound.ts` handles text, images, documents with allowlist enforcement
- **Group support** — configurable group policies with @-mention gating
- **Heartbeat integration** — gateway-side heartbeat runner for keep-alive
- **Typing indicators** — real-time composing status while the agent works
- **Markdown cleaning** — agent output is cleaned for WhatsApp formatting

### Setup

```bash
bun run gateway:login    # Scan QR code to link WhatsApp
bun run gateway          # Start listening for messages
```

Credentials are stored locally at `~/.excelor/credentials/whatsapp/default/`.

### Configuration

Gateway configuration lives in `~/.excelor/gateway.json`:

```json
{
  "channels": {
    "whatsapp": {
      "enabled": true,
      "allowFrom": ["+1234567890"],
      "groupPolicy": "allowlist",
      "groupAllowFrom": ["*"]
    }
  },
  "gateway": {
    "logLevel": "info"
  }
}
```

| Setting | Options | Description |
|---------|---------|-------------|
| `allowFrom` | E.164 phone numbers | Whitelist of allowed senders |
| `groupPolicy` | `open`, `allowlist`, `disabled` | How group messages are handled |
| `groupAllowFrom` | Group IDs or `["*"]` | Which groups the agent responds in |
| `logLevel` | `silent`, `error`, `info`, `debug` | Gateway log verbosity |

### Self-Chat Mode

Message yourself on WhatsApp to interact with the agent privately. The gateway detects self-chat and routes messages directly.

### Group Behavior

In groups, the agent **only responds when @-mentioned** via the WhatsApp mention picker. This prevents noise and ensures intentional interactions.

### `send_whatsapp` Tool

The desktop agent can proactively send messages and files via WhatsApp:

| Parameter | Description |
|-----------|-------------|
| `message` | Plain text message (max 3,000 chars, mutually exclusive with `filePath`) |
| `filePath` | Workspace file path for attachment (one file per call) |
| `caption` | Caption for file attachments (max 3,000 chars, requires `filePath`) |

**Supported attachment types:** PNG, JPG, PDF, DOCX, XLSX, PPTX, and more. The bridge builds image vs. document payloads automatically based on MIME type.

**Bridge:** `POST {EXCELOR_WHATSAPP_BRIDGE_URL}/whatsapp/send` with token header `x-excelor-whatsapp-token`.

### Inbound Message Processing

The gateway processes inbound messages from:
- **Plain text** (`conversation`)
- **Extended text** (`extendedTextMessage.text`)
- **Image/video/document captions** — the caption text is extracted as the message body
- **Media without captions** are skipped (no extractable text)

---

## Heartbeat System

The heartbeat is a **persistent personal checklist and note system** that agents can view and update.

### How It Works

- **Storage:** `~/.excelor/HEARTBEAT.md` — a markdown file the agent manages
- **Actions:** `view` (read current content) or `update` (full markdown replacement)
- **Checklist tracking:** Automatically counts `-` lines to summarize checklist status
- **Persistence:** Survives across sessions — the agent always has access to its notes

### Use Cases

- Track ongoing tasks and their status across sessions
- Maintain a personal research agenda
- Keep a running list of items to follow up on
- Store reminders and notes that persist between conversations

### Gateway Heartbeat

The gateway layer also runs a **heartbeat runner** (`dexter/src/gateway/heartbeat/`) for keep-alive monitoring when the WhatsApp gateway is active.

---

## LLM Providers

Excelor is **model-agnostic**. The platform supports 15 LLM providers with prefix-based routing:

| Provider | Prefix / Detection | Example Models | Category |
|----------|-------------------|----------------|----------|
| **OpenAI** | Default | `gpt-5.4`, `gpt-5.2-codex`, `o3-mini` | Cloud |
| **Anthropic** | `claude-` | `claude-sonnet-4-20250514`, `claude-3.5-sonnet` | Cloud |
| **Google** | `gemini-` | `gemini-2.5-pro`, `gemini-2.0-flash` | Cloud |
| **xAI** | `grok-` | `grok-3`, `grok-3-mini` | Cloud |
| **DeepSeek** | `deepseek-` | `deepseek-chat`, `deepseek-reasoner` | Cloud |
| **Moonshot** | `kimi-` | `moonshot-v1-128k`, `kimi-latest` | Cloud |
| **Z.AI** | `zai:` | `glm-5.1`, `glm-4-plus` | Cloud |
| **MiniMax** | — | `MiniMax-Text-01` | Cloud |
| **OpenRouter** | `openrouter:` | `stepfun/step-3.5-flash`, any model | Proxy |
| **AWS Bedrock** | — | Bedrock-hosted models | Cloud |
| **Vertex AI** | — | Google Cloud models | Cloud |
| **Azure Foundry** | — | Azure-hosted models | Cloud |
| **Ollama** | `ollama:` | Any local model (Llama, Mistral, Qwen, etc.) | Local |
| **LM Studio** | — | Any locally hosted model | Local |
| **LiteLLM** | — | Proxy to any LLM backend | Proxy |

**Agent runtime supported providers:** OpenAI, Anthropic, Google, xAI, DeepSeek, Moonshot, Z.AI, OpenRouter, Ollama. Others are UI-available but route through the supported set.

**Features:**
- Switch providers and models via UI or `/model` command
- Anthropic prompt caching via `cache_control` on system prompt
- Custom models registered in `~/.excelor/custom-models.json`
- Fast model variants (`FAST_MODELS` map) for lightweight sub-tasks
- Per-provider default models and curated model lists (`STATIC_MODELS`)

---

## Complete Tool Registry

The agent runtime dynamically assembles its tool set based on available API keys, channel, and plugins.

### Financial Research Tools

#### Meta-Tools (LLM Routers)

| Tool | Description |
|------|-------------|
| `financial_search` | Primary financial query router — natural language in, delegates to appropriate sub-tools |
| `financial_metrics` | Direct metric router — queries financial statements and key ratios only |
| `read_filings` | SEC filing reader — natural language queries about 10-K, 10-Q, 8-K documents with item catalogs |

#### Finance Sub-Tools (Internal)

| Sub-Tool | Parameters | Description |
|----------|-----------|-------------|
| `get_stock_price` | `ticker` | Current stock price snapshot |
| `get_stock_prices` | `ticker`, `interval` (day/week/month/year), `start_date`, `end_date` | Historical stock prices |
| `get_available_stock_tickers` | — | List all available stock tickers |
| `get_crypto_price_snapshot` | `ticker` (e.g. BTC-USD) | Current crypto price |
| `get_crypto_prices` | `ticker`, `interval` (minute/day/week/month/year), `interval_multiplier`, `start_date`, `end_date` | Historical crypto prices |
| `get_available_crypto_tickers` | — | List all available crypto tickers |
| `get_income_statements` | `ticker`, `period` (annual/quarterly/ttm), `limit`, date filters | Income statement data |
| `get_balance_sheets` | `ticker`, `period`, `limit`, date filters | Balance sheet data |
| `get_cash_flow_statements` | `ticker`, `period`, `limit`, date filters | Cash flow data |
| `get_all_financial_statements` | `ticker`, `period`, `limit`, date filters | All three statements combined |
| `get_key_ratios` | `ticker` | Current key financial ratios |
| `get_historical_key_ratios` | `ticker`, `period`, `limit`, date filters | Historical ratio trends |
| `get_analyst_estimates` | `ticker`, `period` (annual/quarterly) | Consensus analyst estimates |
| `get_company_news` | `ticker`, `limit` (capped at 10) | Recent company news |
| `get_insider_trades` | `ticker`, `limit`, `filing_date` filters | Insider trading activity |
| `get_segmented_revenues` | `ticker`, `period`, `limit` | Revenue breakdown by segment |
| `get_filings` | `ticker`, `filing_type[]`, `limit` | SEC filing listings |
| `get_10K_filing_items` | `ticker`, `accession_number`, `items[]` | Specific 10-K filing sections |
| `get_10Q_filing_items` | `ticker`, `accession_number`, `items[]` | Specific 10-Q filing sections |
| `get_8K_filing_items` | `ticker`, `accession_number` | 8-K filing content |

**API:** `https://api.financialdatasets.ai` with `x-api-key` header. Results are cached locally under `.excelor/cache/` with ticker-prefixed filenames.

#### Yahoo Finance

| Tool | Parameters | Description |
|------|-----------|-------------|
| `yfinance_search` | `command` (`quote`/`history`/`fundamentals`), `ticker`, `start_date`, `end_date`, `interval` (1d/1wk/1mo) | Yahoo Finance data via Python yfinance worker |

Requires system Python with `yfinance` installed. The `yfinance-runner.js` manages the Python subprocess.

### Web Search Tools

| Backend | Env Variable | Priority | Behavior |
|---------|-------------|----------|----------|
| **Exa** | `EXASEARCH_API_KEY` | 1st | LangChain `ExaSearchResults`, 5 results with highlights |
| **Perplexity** | `PERPLEXITY_API_KEY` | 2nd | `sonar` chat completions — returns answer + citations + structured search results |
| **Tavily** | `TAVILY_API_KEY` | 3rd | `TavilySearch`, max 5 results |

First available key wins — only one backend is active at a time.

### X / Twitter Search

| Tool | Description |
|------|-------------|
| `x_search` | X/Twitter search with commands: `search`, `profile`, `thread` |

**Parameters:**
- `search`: `query`, `since` (date), `min_likes`, `sort`, `pages` (1–5), `limit`
- `profile`: fetch user profile data
- `thread`: fetch full tweet thread

Auto-appends `-is:retweet` unless overridden. Requires `X_BEARER_TOKEN`.

### Web Fetch

| Tool | Parameters | Description |
|------|-----------|-------------|
| `web_fetch` | `url`, `extractMode` (`markdown`/`text`), `maxChars` (min 100, default 20,000) | Fetch and extract readable content from any URL |

**Features:**
- **Readability extraction** via Mozilla's `@mozilla/readability` + `linkedom`
- Fallback to `htmlToMarkdown` conversion
- JSON responses are pretty-printed
- **Manual redirect following** (max 3 hops)
- **In-memory cache** — LRU-style, max 100 entries, 15-minute TTL, keyed by URL + mode + maxChars
- **Injection pattern detection** and marker sanitization for external content
- Request timeout: 30 seconds

### Browser Automation

| Tool | Description |
|------|-------------|
| `browser` | Full Playwright-based browser automation |

**Actions:**

| Action | Parameters | Description |
|--------|-----------|-------------|
| `navigate` | `url` | Navigate to a URL |
| `open` | `url` | Open a new browser page |
| `snapshot` | `maxChars` (default 50,000) | Get page content via ARIA snapshot |
| `act` | `request` | Perform an interaction on the page |
| `read` | — | Extract main content text (main/article/body `innerText`) |
| `close` | — | Close the browser |

**Act Request Types:**

| Kind | Parameters | Description |
|------|-----------|-------------|
| `click` | element ref | Click an element |
| `type` | text | Type text into focused element |
| `press` | key | Press a keyboard key |
| `hover` | element ref | Hover over an element |
| `scroll` | `up`/`down` | Scroll the page |
| `wait` | `timeMs` (max 10,000) | Wait for a duration |

**Desktop bridge mode:** When `EXCELOR_BROWSER_BRIDGE_URL` is set, browser actions are proxied through the desktop app's browser bridge. Otherwise, Playwright chromium launches directly (headless: false).

**Reference map:** Elements are targeted via refs from ARIA snapshots, enabling reliable element interaction without brittle CSS selectors.

### Filesystem Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `read_file` | `path`, `offset` (1-based line), `limit` (lines) | Read files with optional range — max 2,000 lines / 50 KiB |
| `write_file` | `path`, `content` | Create or overwrite files, creates parent dirs automatically |
| `edit_file` | `path`, `old_text`, `new_text` | Targeted edits with unique match, fuzzy/normalized matching, BOM + line endings preserved, unified diff in result |

**Sandbox Security:**
- Workspace root = `EXCELOR_WORKSPACE_DIR` or `cwd`
- All paths must resolve **under the workspace root** (no `..` traversal)
- **Symlinks in path components are disallowed** (`assertNoSymlink`)
- Prevents escape from the workspace into the broader filesystem

### Document Tools — Spreadsheet

| Tool | Parameters | Description |
|------|-----------|-------------|
| `createFile` | `format`, `title`, `prompt`, `open`, `confirm` | Create XLSX, DOCX, PPTX, or PDF files |
| `exportCurrentFile` | `targetFormat`, `title`, `prompt`, `fileName`, `open` | Export to PDF |
| `setCellValue` | cell ref, value | Set a single cell |
| `writeCells` | cell range, values | Batch write multiple cells |
| `setCellFormula` | cell ref, formula | Set Excel formulas |
| `formatCells` | cell range, formatting | Apply fonts, colors, borders, number formats |
| `insertRowsColumns` | position, count, type | Insert rows or columns |
| `deleteRowsColumns` | position, count, type | Delete rows or columns |
| `createChart` | data range, chart type | Generate bar, line, or pie charts |
| `createSheet` | name | Add new worksheets |
| `readSheet` | sheet name, range | Read worksheet data for validation |
| `describeWorkbook` | — | Get workbook structure and metadata |
| `readSpreadsheetPrefs` | — | Read spreadsheet preferences |
| `writeSpreadsheetPrefs` | prefs | Write spreadsheet preferences |

Engine: **openpyxl** (Python) for local processing.

### Document Tools — Word

| Tool | Description |
|------|-------------|
| `extractDocxText` | Extract text content from .docx files |
| `renderDocxTemplate` | Render templates with variable substitution (docxtpl) |
| `buildDocxFromSpec` | Build documents from structured specifications (python-docx) |
| `previewDocxAsScreenshot` | Render .docx to PNG via Mammoth HTML + Playwright |

OnlyOffice bridge tools (when editor is active): `insertText`, `formatText`, `insertTable`, `findAndReplace`, `insertList`, `insertPageBreak`.

### Document Tools — Presentation

**PptxGenJS Engine (file-driven):**

| Tool | Description |
|------|-------------|
| `compilePresentationSlides` | Compile and render complete slide decks |
| `extractPresentationText` | Extract text from presentations |
| `preparePresentationTemplate` | Set up slide templates |
| `duplicatePresentationSlide` | Duplicate existing slides |
| `deletePresentationSlides` | Remove slides |
| `reorderPresentationSlides` | Rearrange slide order |
| `cleanPresentationPackage` | Clean presentation package |
| `packPresentationTemplate` | Package presentation for output |

**Granular Slide Tools (from shared spec):**

| Tool | Description |
|------|-------------|
| `addSlide` | Add a new slide |
| `deleteSlide` | Delete a slide |
| `duplicateSlide` | Duplicate a slide |
| `setSlideText` | Set text on a slide |
| `formatSlideText` | Format slide text |
| `addShape` | Add shapes to slides |
| `addChart` | Add charts to slides |
| `insertImage` | Insert images into slides |
| `listSlideShapes` | List all shapes on a slide |
| `readSlideText` | Read text from a slide |
| `verifySlides` | Verify slide content and layout |

Desktop may open generated PPTX in OnlyOffice after completion.

### Document Tools — PDF

| Tool | Description |
|------|-------------|
| `extractPdfText` | Extract text from PDF documents (PyMuPDF) |
| `read_pdf` | Full-file PDF reading (Node pdf-parse, max 50 KiB) |
| `addPdfAnnotation` | Add annotations to PDFs |
| `highlightPdfText` | Highlight text in PDFs |
| `addPdfStamp` | Add stamps/watermarks to PDFs |
| `previewPdfPages` | Render PDF pages to PNG for visual preview (PyMuPDF) |

### WhatsApp Messaging

| Tool | Parameters | Description |
|------|-----------|-------------|
| `send_whatsapp` | `message` (text, max 3,000 chars), `filePath` (attachment), `caption` (file caption, max 3,000 chars) | Send messages and files via WhatsApp |

`message` and `filePath` are mutually exclusive — one per call. Supported file types: PNG, JPG, PDF, DOCX, XLSX, PPTX, and more. Desktop channel only.

### Heartbeat

| Tool | Parameters | Description |
|------|-----------|-------------|
| `heartbeat` | `action` (`view`/`update`), `content` (for update) | View or update the agent's persistent personal checklist at `~/.excelor/HEARTBEAT.md` |

### Skill Invocation

| Tool | Parameters | Description |
|------|-----------|-------------|
| `skill` | `skill` (name), `args` (optional) | Invoke any registered SKILL.md workflow — at most once per query. Lists available skills on error. |

Resolves relative `.md` links in skill instructions to absolute paths.

---

## Crypto Investment Strategy

Excelor can **generate, backtest, and execute crypto investment strategies** in real time using its full tool suite:

### Data Pipeline

| Stage | Tools Used | Data |
|-------|-----------|------|
| **Market Data** | `get_crypto_price_snapshot`, `get_crypto_prices`, `get_available_crypto_tickers` | Real-time and historical prices at minute/day/week/month/year intervals |
| **Fundamental Analysis** | `financial_search`, `financial_metrics`, `get_key_ratios` | On-chain metrics, project fundamentals |
| **Sentiment** | `x_search`, `web_search` | Twitter/X sentiment, community discussion, trending topics |
| **News** | `get_company_news`, `web_fetch`, `browser` | Breaking news, regulatory updates, project announcements |

### Strategy Generation

The agent uses the full LLM reasoning loop to:
1. Analyze historical price patterns and identify signals
2. Design entry/exit rules based on technical and fundamental indicators
3. Define position sizing, stop-loss, and take-profit parameters
4. Write the strategy as executable logic

### Backtesting

Using `get_crypto_prices` with configurable intervals and date ranges, the agent:
1. Retrieves historical data for the target asset
2. Simulates the strategy across the historical period
3. Calculates performance metrics (returns, max drawdown, Sharpe ratio, win rate)
4. Runs sensitivity analysis on key parameters
5. Produces a structured report with the results

### Self-Optimization

Strategies improve over time:
- The agent evaluates outcomes against predictions
- Underperforming parameters are adjusted
- New signals are incorporated from fresh data
- The optimization loop runs continuously via the skill system

---

## Web Automation (Deep Dive)

### Job Application Automation
- Browse job boards (LinkedIn, Indeed, and others) via `browser` tool
- Tailor resumes and cover letters per position using LLM reasoning
- Fill multi-step application forms with `act` (click, type, press)
- Handle file uploads and authentication flows
- Submit applications autonomously
- Monitor application status via periodic `navigate` + `snapshot`

### Data Collection & Scraping
- Navigate to any website and extract structured data via `snapshot` and `read`
- Download documents via `web_fetch` with Readability extraction
- Compile data across multiple pages with multi-tab support
- Cache results to avoid redundant fetches (15-minute TTL, 100-entry LRU)

### Form Automation
- Handle multi-step forms with `click`, `type`, `press` sequences
- File uploads via browser interaction
- Authentication flows with session persistence
- CAPTCHAs and interactive challenges (where solvable)

### Web Monitoring
- Continuous monitoring via scheduled `navigate` + `snapshot` cycles
- Price tracking, availability checks, regulatory filing alerts
- Competitor activity monitoring
- Change detection between snapshots

---

## Self-Optimizing Agents

### The Optimization Loop

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ EXECUTE  │────▶│ EVALUATE │────▶│ GENERATE │────▶│INTEGRATE │
│   TASK   │     │ OUTCOME  │     │ NEW SKILL│     │& IMPROVE │
└──────────┘     └──────────┘     └──────────┘     └────┬─────┘
      ▲                                                  │
      └──────────── continuous improvement ◀─────────────┘
```

### SKILL.md Authoring

Agents create new skills as **markdown-driven workflows** that persist across sessions:

```yaml
---
name: strategy-backtest
description: Backtest a trading strategy against historical data
command: /backtest
verified: true
---

# Instructions

1. Gather historical price data for the specified asset...
2. Apply the strategy parameters...
3. Calculate performance metrics...
```

Skills are automatically discovered at startup and exposed to the LLM. Up to **6,000 characters** per skill are injected into the runtime prompt.

### Plugin Self-Assembly

Agents can generate **entire plugin packages**:

```
generated-plugin/
├── .excelor-plugin/
│   └── plugin.json          # Manifest
├── skills/
│   └── SKILL.md             # Skill workflows
├── tools/
│   └── index.ts             # Tool implementations
├── hooks/
│   └── index.ts             # Lifecycle hooks
├── commands/
│   └── my-command.md         # Command definitions
└── agents/
    └── my-agent.md           # Custom agent definitions
```

Once created, `POST /plugins/refresh` makes the plugin immediately available.

---

## Hook System

Plugins can register **lifecycle hooks** that execute at key points in the agent's operation:

| Hook Event | When It Fires |
|------------|--------------|
| `PreToolUse` | Before a tool is executed |
| `PostToolUse` | After a tool completes |
| `ToolError` | When a tool fails |
| `SessionStart` | When a new agent session begins |
| `SessionEnd` | When an agent session ends |
| `PreCompact` | Before context compaction |
| `PostCompact` | After context compaction |

Hooks are registered via plugin `hooks/index.ts` or `hooks/index.js`. They can modify tool inputs, intercept tool outputs, perform side effects, and shape agent behavior.

**Runtime scope:** Hooks respect `EXCELOR_RUNTIME_SCOPE` — `main`, `onlyoffice`, or `all`.

---

## Skills System

### Skill Discovery

Skills are loaded from multiple sources in priority order:

1. **Official skills** — `dexter/src/skills/` (built-in)
2. **User skills** — `~/.excelor/skills/` (personal)
3. **Project skills** — `<workspace>/.excelor/skills/` (repo-specific)
4. **Plugin skills** — contributed by installed plugins

Optional filtering: `EXCELOR_SKILLS_MODE=enabled-only` + `EXCELOR_ENABLED_SKILLS` to restrict discovery.

### Built-In Skills

| Skill | Description |
|-------|-------------|
| `dcf-valuation` | Full DCF (Discounted Cash Flow) valuation workflow with sector-specific WACC tables (`dcf/sector-wacc.md`) |
| `x-research` | X/Twitter sentiment analysis using `x_search` — search, profile, and thread commands |

### Skill Format

Each skill is a `SKILL.md` file with YAML frontmatter:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier |
| `description` | Yes | What it does (shown to the LLM) |
| `command` | No | CLI trigger (default: `/{slug}`) |
| `verified` | No | Whether it's been validated |
| `hidden` | No | Whether to hide from listings |

### Commands

Commands live under `commands/**/*.md` and extend the agent's capabilities. They support an `argument-hint` field in frontmatter for inline help. State (enabled/disabled) is managed via `runtimeConfigStore`.

---

## Plugin Ecosystem

### Plugin Structure

```
my-plugin/
├── .excelor-plugin/
│   └── plugin.json          # Manifest (name, description, scopes)
├── skills/
│   └── SKILL.md             # Skill workflows
├── tools/
│   └── index.ts             # Tool implementations
├── hooks/
│   └── index.ts             # Lifecycle hooks
├── commands/
│   └── my-command.md         # Command definitions
├── agents/
│   └── my-agent.md           # Custom agent definitions
└── README.md
```

### Plugin Sources

| Priority | Location | Source Label |
|----------|----------|-------------|
| 1 | `<repo>/plugins/` | `builtin` → `official` |
| 2 | `~/.excelor/plugins/` | `user` → `custom` |
| 3 | `<workspace>/.excelor/plugins/` | `project` → `custom` |
| 4 | `config.plugins.externalPaths[]` | `external` → `custom` |

### Manifest Fields

| Field | Description |
|-------|-------------|
| `name` | Unique plugin name (kebab-case, no spaces) |
| `description` | What the plugin does |
| `scopes` | Where it applies (`main`, `onlyoffice`, `all`) |
| `skills` | Skill folder path or manifest entries |
| `tools` | Tool entry point path or manifest entries |
| `commands` | Command folder path or manifest entries |
| `hooks` | Hook paths (string, array, or object) |
| `agents` | Agent definitions folder |

### Plugin Catalog Entry

Each plugin in the catalog exposes: `id`, `name`, `description`, `source`, `desktopSource` (`official` or `custom`), `path`, `manifestPath`, `isLegacy`, `isEnabled`, `scopes`, `loadError`, `updatedAt`, and `components` (skills, tools, hooks, commands, agents arrays).

### Plugin Lifecycle

- Enable/disable globally (`plugins.enabled`) or per-plugin (`plugins.entries[name].enabled`)
- Hot-reload via `POST /plugins/refresh` — no restart required
- Plugin tools, skills, and commands merge into the agent's active set
- Plugin hooks fire at lifecycle events
- Legacy plugins (no manifest) are auto-detected by folder structure

---

## Evaluation Framework

Excelor includes a **LangSmith-based evaluation system** for measuring agent quality:

- **Entry point:** `bun run src/evals/run.ts`
- **Dataset:** `finance_agent.csv` (financial research questions with reference answers)
- **Sampling:** `--sample N` for quick runs
- **Target:** Runs full `Agent.create({ model: 'gpt-5.4', maxIterations: Infinity })`
- **Scoring:** LLM-as-judge (`ChatOpenAI` with structured output) scores 0–1 correctness against reference answers
- **UI:** Ink/TUI components for real-time eval progress
- **Integration:** LangSmith client for dataset management and result tracking

---

## Desktop UI Features

### Workspace File Mentions

The composer supports **@-style workspace file mentions**:
- Type `@` to trigger the file picker
- Fuzzy search across all workspace files
- Keyboard navigation (arrow keys, Enter, Escape)
- Selected files are injected as context into the agent's prompt

### Plugin Management Panel

- Browse all installed plugins with search and filters (all/active/inactive/official)
- Toggle plugins on/off with immediate effect
- Plugin cards show name, description, source badge, component counts
- Framer Motion animations for smooth transitions

### Subagent Activity Cards

When the agent spawns sub-agents, the UI renders **inline activity cards** showing:
- Status pills (running, waiting, completed, failed, closed)
- Role and depth level
- Expandable prompt and activity history
- Live summaries as sub-agents work

### Dashboard

- Main Excelor agent for general/financial research
- Quick-create buttons for XLSX, DOCX, PPTX, PDF
- Suggested queries (earnings analysis, financial comparisons, ratios, balance sheets)
- File-context routing to specialized agents based on open document type

---

## Document Workspace

### OnlyOffice Integration

The desktop app embeds **OnlyOffice** (via Docker) for real-time editing of:

- **Spreadsheets** (XLSX, XLS, CSV)
- **Documents** (DOCX, DOC)
- **Presentations** (PPTX, PPT)
- **PDFs**

The agent reads from and writes to documents through the editor bridge (`POST /editor/tool` with scope, context type, tool name, and arguments).

### File-Context Agents

| Agent | File Types | Key Capabilities |
|-------|-----------|-----------------|
| **Spreadsheet Agent** | `.xlsx`, `.xls`, `.csv` | Cell ops, formulas, formatting, charts (bar/line/pie), multi-sheet, describe workbook, prefs |
| **Document Agent** | `.docx`, `.doc` | Text insertion, formatting, tables, find & replace, lists, page breaks, templates |
| **Presentation Agent** | `.pptx`, `.ppt` | PptxGenJS slide creation, shapes, charts, images, text formatting, slide management |
| **PDF Agent** | `.pdf` | Text extraction, annotations, highlights, stamps, page previews (PNG) |

---

## Financial Research (Deep Dive)

### Research Persona

The agent operates as a **Buffett/Munger-inspired financial researcher** (defined in `SOUL.md`):
- **Value investing principles** — margin of safety, circle of competence
- **Mental models** — inversion, probabilistic thinking
- **Data-first** — triangulation across multiple sources
- **Intellectual honesty** — acknowledges uncertainty, uses sensitivity analysis
- **No performative narration** — results, not theater

### Structured Due Diligence

1. **Business analysis** — What does the company do? Competitive position? Moat?
2. **Financial analysis** — Revenue, margins, cash flow, balance sheet strength
3. **Competition** — Market share, competitive dynamics, substitution risks
4. **Management** — Track record, incentive alignment, capital allocation
5. **Macro factors** — Industry trends, regulatory environment, cyclicality
6. **Risk pre-mortem** — What could go wrong? Scenario analysis
7. **Valuation** — DCF with sector WACC, comparable multiples, margin of safety
8. **Synthesis** — Investment thesis with conviction level

### Marathon Research

For deep research sessions, the agent uses:
- **Phase-gating:** gather → synthesize → anchor → advance
- **Rings of depth:** landscape → financials → moat → risk → valuation
- **Context budgeting:** dense `financial_search` calls, extract-and-discard pattern
- **Compaction-aware workflow:** trusts summaries, avoids redundant fetches, follows "next step"

---

## Security & Privacy

| Feature | Description |
|---------|-------------|
| **Local-first** | Agent runtime on localhost, no cloud dependency |
| **Filesystem sandbox** | All file operations confined to workspace root, symlinks blocked |
| **API key management** | Stored in `.env` (gitignored) or entered interactively |
| **Configuration** | `.excelor/settings.json` (gitignored) |
| **No telemetry** | Nothing sent to Excelor servers |
| **Air-gapped mode** | Ollama or LM Studio for fully offline operation |
| **Audit trails** | Every tool call and result logged in scratchpad JSONL |
| **WhatsApp access control** | E.164 allowlist, group policies, mention-gating |
| **Editor bridge auth** | Token-based authentication (`x-excelor-editor-token`) |
| **WhatsApp bridge auth** | Token-based authentication (`x-excelor-whatsapp-token`) |
| **Browser bridge auth** | Token-based authentication (`x-excelor-browser-token`) |

---

## Environment Variables (Complete)

### LLM Provider Keys

| Variable | Provider |
|----------|---------|
| `OPENAI_API_KEY` | OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic (Claude) |
| `GOOGLE_API_KEY` | Google (Gemini) |
| `XAI_API_KEY` | xAI (Grok) |
| `DEEPSEEK_API_KEY` | DeepSeek |
| `MOONSHOT_API_KEY` | Moonshot (Kimi) |
| `ZAI_API_KEY` | Z.AI (GLM) |
| `OPENROUTER_API_KEY` | OpenRouter |
| `OLLAMA_BASE_URL` | Ollama endpoint (default `http://127.0.0.1:11434`) |

### Data & Search Keys

| Variable | Service |
|----------|---------|
| `FINANCIAL_DATASETS_API_KEY` | Financial data provider |
| `EXASEARCH_API_KEY` | Exa web search (priority 1) |
| `PERPLEXITY_API_KEY` | Perplexity search (priority 2) |
| `TAVILY_API_KEY` | Tavily web search (priority 3) |
| `X_BEARER_TOKEN` | X/Twitter API |

### Bridge & Gateway

| Variable | Purpose |
|----------|---------|
| `EXCELOR_WHATSAPP_BRIDGE_URL` | WhatsApp send bridge endpoint |
| `EXCELOR_WHATSAPP_BRIDGE_TOKEN` | WhatsApp bridge auth token |
| `EXCELOR_BROWSER_BRIDGE_URL` | Browser automation bridge endpoint |
| `EXCELOR_BROWSER_BRIDGE_TOKEN` | Browser bridge auth token |
| `EXCELOR_EDITOR_BRIDGE_URL` | OnlyOffice editor bridge endpoint |
| `EXCELOR_EDITOR_BRIDGE_TOKEN` | Editor bridge auth token |

### Runtime Configuration

| Variable | Purpose |
|----------|---------|
| `EXCELOR_PORT` | Override runtime port (default 27182) |
| `EXCELOR_PYTHON` | Custom Python interpreter path |
| `EXCELOR_WORKSPACE_DIR` | Override workspace root directory |
| `EXCELOR_RUNTIME_SCOPE` | Runtime scope: `main`, `onlyoffice`, `all` |
| `EXCELOR_SKILLS_MODE` | `enabled-only` to restrict skill discovery |
| `EXCELOR_ENABLED_SKILLS` | Comma-separated list of enabled skill names |

### Tracing & Observability

| Variable | Purpose |
|----------|---------|
| `LANGSMITH_API_KEY` | LangSmith tracing |
| `LANGSMITH_ENDPOINT` | LangSmith API endpoint |
| `LANGSMITH_PROJECT` | LangSmith project name |
| `LANGSMITH_TRACING` | Enable/disable tracing |

---

## Technology Stack

| Layer | Technologies |
|-------|-------------|
| **Desktop** | Electron, React 19, TypeScript, Vite, Tailwind CSS 4, Framer Motion, Radix UI, Zustand, @assistant-ui/react |
| **Agent Runtime** | Bun, TypeScript, SSE, gray-matter, LangChain |
| **Gateway** | Bun, Baileys (@whiskeysockets/baileys), session management |
| **Document Engine** | OnlyOffice (Docker), Flask backend |
| **Presentations** | PptxGenJS (file-driven generation) |
| **Spreadsheets** | openpyxl (Python) |
| **Documents** | python-docx, docxtpl, Mammoth |
| **PDFs** | PyMuPDF, pdf-parse |
| **Browser** | Playwright (Chromium) |
| **Web Extraction** | @mozilla/readability, linkedom, htmlToMarkdown |
| **Caching** | In-memory LRU (web fetch), file-based JSON (financial API) |
| **Testing** | Bun test runner |
| **Evaluation** | LangSmith, LLM-as-judge scoring |

---

## Summary

Excelor is not another AI chatbot wrapper. It is an **autonomous execution platform** where:

- Agents **do the work** — research, trade, fill forms, build documents, write code, send messages
- Agents **communicate** — full WhatsApp integration for messaging, file sharing, and group interaction
- Agents **learn and improve** — generating new skills, plugins, and tools from experience
- Agents **collaborate** — spawning up to 6 sub-agents for parallel, specialized tasks
- Agents **remember** — heartbeat checklist persists across sessions, scratchpad logs every action
- Everything runs **locally** — your data stays on your machine
- Any LLM works — **15 providers**, swap models with one command
- The platform is **extensible** — plugins, skills, hooks, commands, and custom agents for any domain
- **Financial research is first-class** — 20+ finance sub-tools, SEC filings, crypto data, analyst estimates
- **Web automation is built in** — Playwright browser with full interaction capabilities
- **Documents are native** — create, edit, and export XLSX, DOCX, PPTX, PDF inside the workspace
- **Quality is measurable** — LangSmith evaluation framework with LLM-as-judge scoring

From crypto investment strategy generation to autonomous job applications, from WhatsApp-based financial research to marathon due diligence sessions, Excelor is the platform where AI agents actually get things done.
