# Excelor — Technical Card

> A local-first, self-evolving AI agent platform that researches, automates, communicates, and builds its own tools — all from your desktop.

---

## Page 1 — What Excelor Is

Excelor is not a chatbot. It is an **autonomous execution engine** packaged as a desktop application. You give it a goal — "build a DCF model for NVIDIA", "backtest a BTC momentum strategy", "fill out this job application" — and it works through the task end-to-end: calling tools, reading documents, browsing the web, spawning specialist sub-agents, and delivering finished artifacts (spreadsheets, slide decks, PDFs) back into your workspace.

The platform ships as four cooperating layers:

| Layer | Technology | Role |
|-------|-----------|------|
| **Desktop UI** | Electron + React 19 + Tailwind 4 | Workspace, chat, document editing, settings |
| **Agent Runtime** | Bun + TypeScript, SSE streaming | Tool-calling loop, scratchpad, context management, reflection |
| **Document Engine** | OnlyOffice (Docker) + Flask | Native XLSX / DOCX / PPTX / PDF editing |
| **Gateway** | Baileys (WhatsApp Web) | Mobile messaging bridge with access control |

Everything runs on `localhost`. No data leaves your machine unless you explicitly choose a cloud LLM provider. Pair it with Ollama or LM Studio for fully air-gapped operation.

---

## Page 2 — Unique Architecture

### The Three-Process Design

Most AI desktop apps are thin wrappers around a cloud API. Excelor inverts that model. The Electron shell manages windows, files, and IPC but never touches LLM calls directly. Instead, it proxies every request to a **Bun-based agent server** running on `localhost:27182` over HTTP + Server-Sent Events. This separation means:

- The agent runtime is stateless across restarts and can be replaced or upgraded independently.
- SSE streaming gives the UI real-time visibility into every reasoning step, tool call, and token as it happens.
- The same runtime serves the desktop UI, the WhatsApp gateway, and the OnlyOffice editor bridge through a unified HTTP surface.

```
┌─────────────────────────────────────────────────────────┐
│                    DESKTOP SHELL                         │
│  Electron  •  React 19  •  Zustand  •  Framer Motion   │
│  @assistant-ui/react  •  Radix UI  •  Tailwind 4       │
├─────────────────────────────────────────────────────────┤
│                  IPC + HTTP BRIDGE                       │
│  excelor-runtime.js  ───  POST /run (SSE)               │
│  provider-store.js   ───  POST /abort                   │
│  plugin-manager.js   ───  POST /plugins/refresh         │
├─────────────────────────────────────────────────────────┤
│              AGENT RUNTIME (Bun, :27182)                 │
│  Agent loop  •  Tool registry  •  Scratchpad (JSONL)    │
│  Context manager  •  Subagent orchestrator              │
│  Reflection pipeline  •  Hook system  •  Plugin runtime │
├─────────────────────────────────────────────────────────┤
│              EXTERNAL SERVICES (optional)                │
│  OnlyOffice (:8080)  •  WhatsApp gateway                │
│  Playwright browser  •  Financial API cache             │
└─────────────────────────────────────────────────────────┘
```

### Model-Agnostic by Design

The runtime resolves providers through prefix-based routing (`claude-` → Anthropic, `gemini-` → Google, `grok-` → xAI, `ollama:` → local). Fifteen providers are supported out of the box. Switching models is a single settings change — the agent loop, tool registry, and context management all adapt automatically.

### Filesystem Sandbox

All file operations are confined to the workspace root. Symlink components in path resolution are rejected. There is no mechanism for the agent to escape its workspace boundary.

---

## Page 3 — The Agent Loop

The core of Excelor is an **iterative tool-calling loop** with no fixed iteration cap (`maxIterations = Infinity`). The agent runs until the task is done or it decides it cannot proceed.

```
   ┌─────────────────────────────────────────┐
   │          Receive user query              │
   └──────────────────┬──────────────────────┘
                      ▼
   ┌─────────────────────────────────────────┐
   │  Initialize plugins, load tool registry  │
   │  Build system prompt (soul + skills +    │
   │  desktop context + subagent prompts)     │
   └──────────────────┬──────────────────────┘
                      ▼
   ┌──────────────────────────────────────────┐
   │         Stream model call (SSE)          │◄──────┐
   │  LLM decides which tools to invoke       │       │
   └──────────────────┬──────────────────────┘       │
                      ▼                               │
   ┌──────────────────────────────────────────┐       │
   │      Execute tools via tool-executor     │       │
   │  Log results to scratchpad (JSONL)       │       │
   └──────────────────┬──────────────────────┘       │
                      ▼                               │
   ┌──────────────────────────────────────────┐       │
   │      Manage context                      │       │
   │  Micro-compact → Auto-compact → Restore  │       │
   └──────────────────┬──────────────────────┘       │
                      ▼                               │
                 More tools needed?  ─── yes ─────────┘
                      │ no
                      ▼
   ┌──────────────────────────────────────────┐
   │   Generate final answer (separate call,  │
   │   no tools bound, full scratchpad context)│
   └──────────────────┬──────────────────────┘
                      ▼
   ┌──────────────────────────────────────────┐
   │        Run skill reflection pipeline     │
   │        Emit done event with metrics      │
   └──────────────────────────────────────────┘
```

### Context Management (Three Layers)

Long-running research sessions can exceed model context windows. Excelor handles this transparently:

| Layer | Trigger | Action |
|-------|---------|--------|
| **Per-result capping** | Single tool output > 50,000 chars | Truncate to 2,000-char preview; full output persisted to disk |
| **Micro-compact** | Estimated context > fixed threshold | Replace older tool results with one-line compressed summaries, keep recent N results in full |
| **Auto-compact** | Context still large after micro-compact (model-aware threshold, real API token counts preferred) | Full LLM summarization of the scratchpad preserving intent, key findings, errors, and next steps |

After full compaction, lightweight runtime hints (desktop editor context, recent tool names, thread metadata) are re-injected on top of the summary so the agent does not lose awareness of its environment.

---

## Page 4 — Reflection: How Excelor Learns From Itself

Reflection is the mechanism that turns a one-off task into a reusable workflow. After every successful run on the desktop main thread, Excelor evaluates whether the work it just did is worth capturing as a **skill** — a documented, repeatable process that future runs can invoke directly.

### How the Reflection Pipeline Works

1. **Gate check.** Reflection only fires when the run completed successfully (`status: done`), originated from the desktop channel, ran on the main thread (not a subagent), and used at least 3 tool calls. Trivial or failed runs are skipped.

2. **Summarize the run.** The pipeline extracts the user's original query, a digest of the tool calls made (up to 12), the first 6,000 characters of the final answer, and the names of all existing skills.

3. **LLM judgment call.** A fast model evaluates this summary against a structured schema:
   - Was the task multi-step or domain-specific enough to warrant a reusable skill?
   - Does a suitable skill already exist?
   - Should the proposal **create** a new skill or **update** an existing one?

4. **Emit events.** If the model recommends a skill, the pipeline emits a `skill_reflection` event (a short rationale) and a `skill_proposal` event containing the proposed skill name, description, and full markdown body. The user sees both in the UI and must approve before anything is written.

5. **User confirms.** Only after explicit user confirmation does `manage_skill` write the `SKILL.md` file to disk. The skill is immediately available for future runs — no restart required.

### Why This Matters

Traditional AI assistants reset after every conversation. Excelor's reflection pipeline means the platform **accumulates domain knowledge over time**. A financial analyst who runs three different types of due diligence will gradually build a library of skills tailored to their workflow — without ever writing a line of code.

```
 ┌──────────┐     ┌──────────┐     ┌──────────────┐     ┌──────────────┐
 │  EXECUTE  │────▶│ EVALUATE │────▶│  PROPOSE NEW │────▶│ USER APPROVES│
 │   TASK    │     │  OUTCOME │     │     SKILL    │     │  → PERSISTED │
 └──────────┘     └──────────┘     └──────────────┘     └──────┬───────┘
       ▲                                                       │
       └──────────── skill available for next run ◀────────────┘
```

### Reflection Output Schema

The reflection model returns structured JSON conforming to this schema:

| Field | Type | Purpose |
|-------|------|---------|
| `shouldPropose` | boolean | Whether a skill proposal is warranted |
| `reflection` | string | Short rationale shown to the user (max 2 sentences) |
| `proposal.action` | `create` or `update` | New skill vs. improving an existing one |
| `proposal.name` | string | Kebab-case skill identifier |
| `proposal.description` | string | What the skill does (shown to the LLM in future prompts) |
| `proposal.body` | string | Full markdown skill body with step-by-step instructions |
| `proposal.skillNameToUpdate` | string | Target skill name when action is `update` |

---

## Page 5 — Sub-Agent Orchestration

For complex tasks, a single agent thread is not enough. Excelor's sub-agent system lets the primary agent **delegate work to up to six parallel specialists**, each with its own tool loop, scratchpad, and role definition.

### How It Works

| Tool | Purpose |
|------|---------|
| `spawn_agent` | Create a role-specialized sub-agent with a defined nickname, role, and model |
| `send_input` | Send follow-up instructions to a running sub-agent |
| `resume_agent` | Resume a waiting or idle sub-agent |
| `wait` | Block until a sub-agent completes (10–3,600s timeout) |
| `close_agent` | Gracefully shut down a sub-agent |

**Constraints:** Maximum 6 concurrent threads, nesting depth of 1 (sub-agents cannot spawn their own sub-agents). Each sub-agent runs its own independent tool loop with its own scratchpad.

### Example: Competitive Analysis

The user asks: *"Compare the financial health of Apple, Microsoft, and Google."*

The primary agent spawns three sub-agents:

| Sub-agent | Role | Task |
|-----------|------|------|
| `apple-analyst` | Financial Researcher | Pull AAPL financials, ratios, recent filings, insider trades |
| `msft-analyst` | Financial Researcher | Pull MSFT financials, ratios, recent filings, insider trades |
| `goog-analyst` | Financial Researcher | Pull GOOGL financials, ratios, recent filings, insider trades |

All three work in parallel. The primary agent waits for completion, then synthesizes their outputs into a unified comparison table and investment thesis. What would take a single-threaded agent 15+ sequential tool calls finishes in roughly a third of the time.

---

## Page 6 — Self-Optimization and Plugin Self-Assembly

Excelor agents do not just use tools — they **build new ones**.

### Skill Authoring

Skills are markdown-driven workflows with YAML frontmatter:

```yaml
---
name: earnings-preview
description: Build a pre-earnings analysis brief for a public company
command: /earnings
verified: true
---

# Instructions

1. Fetch the latest analyst estimates for the given ticker.
2. Pull the most recent quarterly financials and calculate year-over-year trends.
3. Search for recent management commentary and guidance from earnings calls.
4. Check insider trading activity in the last 90 days.
5. Summarize everything in a structured brief with bull/bear scenarios.
```

Skills are discovered from four sources (in priority order): built-in (`dexter/src/skills/`), user-level (`~/.excelor/skills/`), project-level (`<workspace>/.excelor/skills/`), and plugin-contributed. Up to 6,000 characters per skill are injected into the runtime prompt.

### Plugin Self-Assembly

Beyond skills, agents can generate **entire plugin packages** — structured folders containing tools, hooks, commands, custom agent personas, and skill workflows:

```
generated-plugin/
├── .excelor-plugin/
│   └── plugin.json          # Manifest
├── skills/
│   └── SKILL.md             # Workflows
├── tools/
│   └── index.ts             # Tool implementations
├── hooks/
│   └── index.ts             # Lifecycle hooks
├── commands/
│   └── command.md            # Command definitions
└── agents/
    └── persona.md            # Custom agent persona
```

Once created, `POST /plugins/refresh` makes the plugin immediately available — no restart required. The hook system supports lifecycle events (`PreToolUse`, `PostToolUse`, `ToolError`, `SessionStart`, `SessionEnd`, `PreCompact`, `PostCompact`) for shaping agent behavior.

---

## Page 7 — Equity Research: The Buffett/Munger Machine

Excelor's financial research persona is defined in `SOUL.md` as a **Buffett/Munger-inspired analyst** — value-oriented, data-first, intellectually honest about uncertainty. This is not a wrapper around a stock API. It is a structured due diligence engine backed by 20+ financial sub-tools, SEC filing readers, and a multi-phase analytical framework.

### The Research Arsenal

| Tool Category       | Tools                                                                                      | What They Provide                                                                                                                   |
|---------------------|--------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------|
| **Price data**      | `get_stock_price`, `get_stock_prices`, `get_crypto_price_snapshot`, `get_crypto_prices`    | Real-time and historical OHLCV data at configurable intervals (minute to year); can use any financial data provider                |
| **Fundamentals**    | `get_income_statements`, `get_balance_sheets`, `get_cash_flow_statements`, `get_all_financial_statements` | Multi-year financial statements (annual, quarterly, TTM), sourced from any available financial data provider                       |
| **Ratios & metrics**| `get_key_ratios`, `get_historical_key_ratios`, `get_segmented_revenues`                   | P/E, EV/EBITDA, ROE, ROIC, margins, segment breakdowns with historical trends; provider-agnostic for maximum flexibility           |
| **SEC filings**     | `get_filings`, `get_10K_filing_items`, `get_10Q_filing_items`, `get_8K_filing_items`      | Full-text filing sections: risk factors, MD&A, segment revenue, footnotes; supports multiple sources including the SEC and others  |
| **Market intelligence** | `get_analyst_estimates`, `get_insider_trades`, `get_company_news`                     | Consensus estimates, insider buy/sell activity, breaking news; enables selection of data provider as needed                        |
| **Sentiment**       | `x_search`, `web_search`, `web_fetch`                                                     | X/Twitter sentiment, web articles, community discussion, aggregating insights from a range of providers                            |
| **Valuation**       | DCF skill with `dcf/sector-wacc.md` tables                                                | Sector-appropriate discount rates, sensitivity tables, margin-of-safety calculations, all compatible with any financial data source |

### The Eight-Step Due Diligence Framework

Every deep research session follows a structured checklist:

1. **Business understanding** — What does the company actually do? Revenue model, unit economics, relationship to scale.
2. **Financial forensics** — Multi-year income, balance sheet, and cash flow trends. Red flag scan: receivables vs. revenue growth, goodwill as % of assets, adjusted vs. GAAP earnings gap, related-party transactions.
3. **Competitive position** — Moat identification (network effects, switching costs, IP, cost advantages). Porter's Five Forces with real data, not assertions. Is the moat widening or narrowing?
4. **Management and governance** — Insider ownership, compensation incentives, capital allocation track record, board independence.
5. **Industry and macro** — Secular tailwinds/headwinds, regulatory environment, cyclical positioning, bottoms-up TAM analysis.
6. **Risk pre-mortem** — Before forming a view, explicitly ask: *what would make me wrong?* Bull case risks, bear case risks, tail risks.
7. **Valuation** — Absolute (DCF with explicit assumptions and sensitivity analysis), relative (trading comps against true peers, historical self-valuation), sanity checks (does the implied growth rate make sense?).
8. **Synthesis** — One-paragraph investment thesis, key metrics table, bull/base/bear scenarios with price targets and probabilities, and what would flip the thesis.

### Marathon Research and Progressive Deepening

Deep due diligence can take dozens of tool calls. Excelor structures this as concentric rings:

```
Ring 1: Landscape scan → what does it do? headline financials? scale?
  Ring 2: Financial deep-dive → multi-year trends, unit economics, margin trajectory
    Ring 3: Competitive moat → who competes? switching costs? evidence of moat width
      Ring 4: Risk mapping → what kills the thesis? regulatory, tech, financial, governance
        Ring 5: Valuation and synthesis → DCF, comps, sensitivity, final verdict
```

Each ring consolidates findings into durable conclusions before the next begins. If context compaction fires between rings, the crystallized facts survive — the agent never loses the thread.

### Triangulation Discipline

The agent never trusts a single data source. Financial data is cross-checked between API results, SEC filings, and earnings transcripts. Competitive claims are verified against industry reports and competitor filings. Growth narratives are stress-tested against actual numbers. When sources conflict, that is a finding, not a problem.

### Example: Full Due Diligence on NVIDIA

**User prompt:** *"Run a full due diligence on NVIDIA. I'm considering a position."*

**What happens:**
1. Agent spawns sub-agents: `nvda-financials` (financial forensics), `nvda-competition` (AMD, Intel, custom chip landscape), `nvda-filings` (10-K risk factors and MD&A).
2. Financial sub-agent pulls 5 years of income statements, balance sheets, cash flows, key ratios, segment revenues, and analyst estimates.
3. Filing sub-agent reads the latest 10-K: risk factors (export controls, customer concentration), management discussion (data center growth drivers), segment revenue breakdown.
4. Competition sub-agent pulls comparable financials for AMD and Intel, calculates relative valuation multiples, and searches for custom silicon developments at major customers.
5. Parent agent synthesizes all outputs, runs DCF with sector WACC from `dcf/sector-wacc.md`, builds sensitivity tables, and produces a bull/base/bear framework.
6. Output: XLSX workbook with financial model and charts, PPTX investment memo, and a text summary with conviction level.
7. Reflection pipeline proposes an "equity-deep-dive" skill capturing the full workflow.

---

## Page 8 — Trading Strategy Development and Backtesting

Excelor can **design, backtest, and iteratively optimize** trading strategies using its full tool suite and LLM reasoning loop. The platform covers the complete strategy development lifecycle — from data retrieval through parameter optimization — for both equities and crypto.

> **Important:** Excelor is a research and strategy development platform. It does not connect to any exchange or brokerage API for live trade execution. Strategies are designed and backtested locally; execution is left to the user.

### Data Pipeline

> **Note:** Excelor can source data from any supported financial data provider. You may freely select or configure providers for each stage below.

| Stage             | Tools                                                      | Data                                                                                   |
|-------------------|------------------------------------------------------------|----------------------------------------------------------------------------------------|
| **Market data**   | `get_stock_prices`, `get_crypto_prices`, `get_crypto_price_snapshot` | OHLCV at minute/day/week/month/year intervals with configurable date ranges                          |
| **Fundamentals**  | `financial_search`, `financial_metrics`, `get_key_ratios`  | Revenue, margins, ratios, on-chain metrics for fundamental signals                                  |
| **Sentiment**     | `x_search`, `web_search`                                   | X/Twitter sentiment, community discussion, trending topics                                         |
| **News**          | `get_company_news`, `web_fetch`, `browser`                 | Breaking news, regulatory updates, project announcements                                           |
| **Analyst views** | `get_analyst_estimates`, `get_insider_trades`              | Consensus estimates, insider activity for contrarian signals                                       |

### Strategy Generation

The agent uses the full LLM reasoning loop — not a fixed template — to design strategies:

1. **Analyze historical price patterns** — Retrieve data, compute technical indicators (moving averages, RSI, MACD, Bollinger Bands), and identify recurring signals.
2. **Design entry/exit rules** — Define conditions based on technical, fundamental, or sentiment triggers. The agent writes the logic as explicit, testable rules.
3. **Define risk parameters** — Position sizing, stop-loss levels, take-profit targets, maximum drawdown thresholds.
4. **Write the strategy as executable logic** — The agent outputs strategy rules in a structured format that can be reviewed, modified, and applied.

### Backtesting

Using `get_crypto_prices` or `get_stock_prices` with configurable intervals and date ranges:

1. Retrieve historical data for the target asset(s).
2. Simulate the strategy across the historical period, applying entry/exit rules tick by tick.
3. Calculate performance metrics:
   - **Total return** and annualized return
   - **Maximum drawdown** and recovery time
   - **Sharpe ratio** and Sortino ratio
   - **Win rate** and average win/loss ratio
   - **Number of trades** and average holding period
4. Run sensitivity analysis on key parameters (e.g., vary EMA windows, stop-loss levels, position sizes).
5. Produce a structured report with results in a spreadsheet, including entry/exit markers on a price chart.

### Strategy Optimization Loop

Strategies improve iteratively through the same reflection and skill system that powers the rest of the platform:

```
 ┌──────────────┐     ┌───────────────┐     ┌──────────────────┐
 │  DESIGN      │────▶│  BACKTEST     │────▶│  EVALUATE        │
 │  Strategy    │     │  Historical   │     │  Metrics + edge  │
 └──────────────┘     └───────────────┘     └────────┬─────────┘
        ▲                                            │
        │         ┌──────────────────┐               │
        └─────────│  REFINE          │◀──────────────┘
                  │  Adjust params,  │
                  │  add new signals │
                  └──────────────────┘
```

- The agent evaluates outcomes against expectations and identifies weak parameters.
- Underperforming rules are adjusted; new signals (sentiment, fundamental, news-driven) are incorporated.
- The optimization loop can run continuously via the skill system, persisting the best parameter set.
- A `/backtest` skill can be generated by the reflection pipeline, capturing the full strategy-development workflow for one-command reuse.

### Example: BTC Momentum Strategy

**User prompt:** *"Design and backtest a momentum strategy for BTC-USD. Use daily data over the last 3 years. I want entry rules, exit rules, and a full performance report."*

**What happens:**
1. `get_crypto_prices` retrieves 3 years of daily BTC-USD OHLCV data.
2. The agent designs a dual-EMA crossover strategy: buy when 20-day EMA crosses above 50-day EMA, sell on the reverse crossover, with a 5% trailing stop-loss.
3. The strategy is simulated across the historical period.
4. Performance report: total return, max drawdown, Sharpe ratio, win rate, trade count, average holding period.
5. Sensitivity matrix varies EMA windows (15/40, 20/50, 25/60) and stop-loss levels (3%, 5%, 8%) to find the optimal parameter set.
6. Output: XLSX workbook with trade log, equity curve chart, and sensitivity heatmap.
7. The agent compares results to a buy-and-hold baseline and makes a clear recommendation on whether the strategy adds alpha.

### Example: Multi-Asset Equity Screener

**User prompt:** *"Screen the FAANG stocks for the best risk-adjusted entry right now. Compare their fundamentals, recent price action, and analyst sentiment."*

**What happens:**
1. Agent spawns sub-agents for each ticker (AAPL, AMZN, GOOG, META, NFLX).
2. Each sub-agent pulls current price, key ratios, recent financials, analyst estimates, insider trades, and X/Twitter sentiment.
3. Parent agent synthesizes into a comparison matrix: P/E, EV/EBITDA, revenue growth, FCF yield, insider buy/sell ratio, sentiment score.
4. Ranks stocks by a composite risk-adjusted score.
5. Output: formatted comparison table in XLSX with a summary thesis for the top-ranked pick.

---

## Page 9 — Excel Mastery: Financial Modeling and Spreadsheet Automation

Excelor treats spreadsheets as first-class artifacts — not flat tables, but **live financial models** with formulas, named ranges, conditional formatting, charts, and multi-sheet architectures. The agent builds, audits, and iterates on Excel workbooks the same way a senior analyst would: structurally, with linked assumptions, and with every output traceable back to its inputs.

### What the Agent Can Build

Excelor can construct any standard financial model from a natural-language prompt. The following are not templates — each model is generated dynamically by the LLM reasoning loop, adapted to the specific company, asset class, or scenario the user describes.

| Model Type | Description |
|------------|-------------|
| **Three-Statement Model** | Linked Income Statement → Balance Sheet → Cash Flow Statement with automated balancing checks, working capital schedules, and debt/interest circularity resolution |
| **Discounted Cash Flow (DCF)** | Unlevered FCF projections, terminal value (perpetuity growth and exit multiple methods), WACC calculation from beta/cost-of-debt inputs, equity bridge, and sensitivity tables on growth rate vs. discount rate |
| **Leveraged Buyout (LBO)** | Sources & uses, debt schedule with multiple tranches (senior, mezzanine, PIK), cash sweep mechanics, management rollover, sponsor equity returns (IRR and MOIC) across hold periods |
| **Merger Model (M&A)** | Accretion/dilution analysis, purchase price allocation, pro-forma combined financials, synergy phasing schedule, goodwill and intangible asset creation, EPS impact at various offer premiums |
| **Comparable Company Analysis** | Pulls peer financials, computes trading multiples (EV/Revenue, EV/EBITDA, P/E, P/FCF), calculates mean/median/percentile benchmarks, derives implied valuation range for the target |
| **Precedent Transaction Analysis** | Searches for relevant M&A transactions, computes acquisition multiples, adjusts for control premiums, produces implied valuation brackets |
| **Revenue Build / Operating Model** | Bottom-up revenue forecasting by segment, geography, or product line with driver-based assumptions (units × price, subscribers × ARPU, GMV × take rate), cost structure modeling, and margin bridge |
| **Budget & Forecast Model** | Department-level or consolidated P&L budgets with monthly/quarterly granularity, variance tracking (actual vs. budget vs. prior year), and rolling forecast mechanics |
| **Scenario & Sensitivity Analysis** | Data tables, tornado charts, and Monte Carlo-style scenario matrices toggled by a single assumptions cell — bull/base/bear cases with probability-weighted expected values |
| **Option Pricing Models** | Black-Scholes and binomial lattice implementations for equity options, convertible instruments, and employee stock option (ESO) expensing under ASC 718 |
| **Portfolio Construction & Optimization** | Mean-variance optimization, efficient frontier computation, risk-parity weighting, correlation matrices, and Sharpe-maximizing allocation across a user-defined asset universe |
| **Credit Analysis Model** | Debt capacity analysis, interest coverage and leverage ratio projections, covenant compliance testing, recovery waterfall for distressed scenarios |
| **Real Estate Pro Forma** | Rent roll modeling, NOI projections, cap rate valuation, levered/unlevered IRR, debt service coverage ratio (DSCR), and equity waterfall with promote structures |
| **Startup / Venture Financial Model** | Cohort-based growth modeling, unit economics (CAC, LTV, payback period), cash runway projections, dilution tables across funding rounds, and break-even analysis |

### How It Works Under the Hood

1. **Assumption sheet first.** Every model begins with a dedicated assumptions tab — growth rates, margins, discount rates, tax rates, share counts — clearly separated from calculations. This makes the model auditable and scenario-toggleable.

2. **Formula-linked architecture.** The agent writes Excel formulas (`=SUM`, `=VLOOKUP`, `=INDEX/MATCH`, `=NPV`, `=IRR`, `=XIRR`, circular references with iterative calculation flags) rather than hardcoded values. Outputs update when assumptions change, just like a hand-built Wall Street model.

3. **Multi-sheet structure.** Complex models span multiple worksheets — Assumptions, Income Statement, Balance Sheet, Cash Flow, DCF, Sensitivity, Charts — with cross-sheet references that maintain structural integrity.

4. **Formatting and readability.** The agent applies professional formatting: input cells highlighted in blue font, calculated cells in black, section headers with borders, number formatting (thousands separators, percentage formats, accounting notation), and frozen panes for navigation.

5. **Validation and sanity checks.** After building a model, the agent runs its own audit: does the balance sheet balance? Does cash flow from operations reconcile? Are growth rates within plausible bounds? Are circular references resolving? Errors are flagged and fixed before delivery.

6. **Chart generation.** Revenue waterfalls, margin trend lines, debt paydown schedules, sensitivity heatmaps, and equity value bridges are embedded as native Excel charts within the workbook.

### Spreadsheet Tools

| Tool | Capability |
|------|-----------|
| `create_spreadsheet` | Build XLSX workbooks with multiple sheets, formulas, formatting, and charts |
| `edit_spreadsheet` | Modify existing workbooks — update cells, add sheets, insert formulas, adjust formatting |
| `read_spreadsheet` | Parse and extract data from uploaded XLSX/CSV files for analysis or model inputs |
| `create_chart` | Generate Excel-native charts (bar, line, waterfall, scatter, heatmap) embedded in the workbook |
| OnlyOffice integration | Open and live-edit spreadsheets in a native Excel-compatible editor within the Excelor desktop |

### Beyond Financial Modeling

Excelor's spreadsheet capabilities extend to any structured data task:

- **Data cleaning and transformation** — Parse messy CSVs, normalize formats, deduplicate, pivot, and restructure data across sheets.
- **Reporting dashboards** — KPI trackers, sales reports, inventory summaries, and operational dashboards with conditional formatting and sparklines.
- **Statistical analysis** — Regression outputs, descriptive statistics, correlation matrices, and hypothesis test summaries formatted as publication-ready tables.
- **Automated reconciliation** — Match transaction records across sources, flag discrepancies, and produce exception reports.
- **Template generation** — Create reusable workbook templates with protected formula cells, dropdown validation lists, and instruction sheets.

### Example: Full Three-Statement Model for Tesla

**User prompt:** *"Build a three-statement financial model for Tesla with 5-year projections and a DCF valuation."*

**What happens:**
1. Financial tools pull Tesla's historical income statements, balance sheets, and cash flow statements (3–5 years of actuals).
2. The agent builds an **Assumptions** sheet: revenue growth by segment (automotive, energy, services), gross margin trajectory, OpEx as % of revenue, CapEx schedule, working capital days, tax rate, share count, and WACC inputs.
3. **Income Statement** sheet projects revenue through 2030 with segment-level drivers, cost of goods sold, gross profit, operating expenses, EBIT, interest, taxes, and net income — all formula-linked to assumptions.
4. **Balance Sheet** sheet projects assets (cash, receivables, inventory, PP&E, intangibles), liabilities (payables, debt tranches, deferred revenue), and equity with a plug to ensure it balances.
5. **Cash Flow Statement** sheet derives operating cash flow from net income with working capital adjustments, investing cash flow from CapEx and acquisitions, and financing cash flow from debt issuance/repayment and buybacks.
6. **DCF** sheet calculates unlevered free cash flow, applies WACC, computes terminal value via both perpetuity growth (3%) and exit multiple (15× EBITDA), discounts to present value, and builds an equity bridge (enterprise value → minus net debt → equity value → per-share value).
7. **Sensitivity** sheet generates a two-variable data table: implied share price across a matrix of WACC (8%–12%) vs. terminal growth rate (2%–4%).
8. **Charts** sheet embeds revenue waterfall, margin trends, FCF trajectory, and a football-field valuation range chart.
9. Output: a single XLSX workbook with 7+ tabs, 200+ formulas, and professional formatting — ready to present or modify.

### Example: LBO Model for a Private Equity Deal

**User prompt:** *"Model an LBO for Petco at a $6B enterprise value. Assume 60% leverage, 5-year hold, and 10% revenue growth."*

**What happens:**
1. The agent pulls Petco's latest financials and builds a standalone operating model.
2. **Sources & Uses** tab: $6B EV, 60/40 debt-to-equity split, transaction fees, financing fees, cash-to-balance-sheet.
3. **Debt Schedule** tab: senior term loan (SOFR + 400bps, 7-year amortization), second lien (SOFR + 700bps, bullet), mezzanine (12% cash / 2% PIK). Mandatory amortization, optional prepayment with excess cash sweep at 75%.
4. **Operating Model** tab: 5-year revenue projections at 10% growth, EBITDA margin expansion from 12% to 15%, CapEx at 3% of revenue, working capital normalized.
5. **Returns Analysis** tab: sponsor equity IRR and MOIC at exit multiples ranging from 8× to 12× EBITDA, across hold periods of 3 to 7 years. Entry at 10× implies a 22% IRR and 2.7× MOIC at exit in Year 5 at 10×.
6. **Sensitivity** tab: IRR sensitivity to entry multiple, exit multiple, revenue growth, and margin assumptions.
7. Output: complete LBO workbook with all tabs linked, ready for investment committee presentation.

---

## Page 10 — Presentation Generation: Slide Decks From a Single Prompt

Excelor generates **native .pptx presentations** — not screenshots, not PDFs of HTML, but real PowerPoint files with editable text, shapes, charts, and images. The system uses PptxGenJS under the hood and a multi-agent orchestration pipeline that plans, designs, and assembles decks slide-by-slide with the same structural discipline a senior associate at an investment bank would apply.

### How the Pipeline Works

Presentation generation follows a five-stage pipeline, fully automated from a single user prompt:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐     ┌──────────────┐     ┌─────────┐
│  1. RESEARCH  │────▶│  2. DESIGN    │────▶│  3. ORCHESTRATE  │────▶│  4. COMPILE   │────▶│  5. QA  │
│  Gather data, │     │  Pick palette,│     │  Spawn subagents │     │  Merge slide  │     │  Verify │
│  understand   │     │  fonts, style │     │  per slide type  │     │  JS modules   │     │  & fix  │
│  requirements │     │  recipe       │     │  (up to 5 conc.) │     │  into one PPTX│     │         │
└──────────────┘     └──────────────┘     └──────────────────┘     └──────────────┘     └─────────┘
```

1. **Research.** The agent gathers all content needed for the deck — pulling financial data, searching the web, reading uploaded documents, or using the user's notes. No slide is written until the data is assembled.

2. **Design.** The agent selects a color palette, font pairing, and visual style recipe (Sharp & Compact for data-heavy decks, Soft & Balanced for corporate, Rounded & Spacious for product marketing, Pill & Airy for brand launches). Every slide inherits from a unified five-color theme object (`primary`, `secondary`, `accent`, `light`, `bg`).

3. **Orchestrate.** The agent classifies every slide into a page type and spawns specialized sub-agents — up to five running concurrently — each responsible for generating a single slide as a standalone JavaScript module.

4. **Compile.** A compile script imports all slide modules in order, passes the shared theme, and writes the final `.pptx` file. The output is a single editable PowerPoint file.

5. **QA.** The agent extracts text from the compiled deck using `markitdown`, checks for missing content, placeholder text, layout errors, and formatting inconsistencies, then fixes and re-verifies in a loop until the deck passes inspection.

### Slide Types and Specialist Sub-Agents

Each slide in a deck is classified as exactly one page type, and a specialist sub-agent handles generation:

| Page Type | Sub-Agent | What It Produces |
|-----------|-----------|-----------------|
| **Cover page** | `cover-page-generator` | Title, subtitle, date, author/firm — asymmetric, centered, or institutional layouts with dramatic font hierarchy (72–120pt title vs. 18pt meta) |
| **Table of contents** | `table-of-contents-generator` | Section list with optional icons and page numbers for navigation |
| **Section divider** | `section-divider-generator` | Clean transition slides with section number and title |
| **Content page** | `content-page-generator` | Text, mixed media, comparisons, timelines, image showcases — varied layouts across the deck |
| **Market narrative** | `market-narrative-page-generator` | Headline + S-curve adoption chart + four-column footer (TAM, market position, trajectory) |
| **Dashboard charts** | `dashboard-chart-generator` | Pie/doughnut, capsule columns, overlapping grouped bars, tag pills, grid panels — works on light, dark, or brand palettes |
| **Financial data** | `financial-data-page-generator` | Dense tables, KPI strips, comps grids, valuation summaries with source citations |
| **Legal disclaimer** | `legal-disclaimer-page-generator` | Safe harbor language, forward-looking statements, research disclaimers |
| **Summary / closing** | `summary-page-generator` | Key takeaways, call to action, next steps, contact information |

### Design System

Every deck is governed by a coherent design system, not ad-hoc styling:

| Dimension | What the Agent Controls |
|-----------|------------------------|
| **Color palette** | Pre-built palettes for different contexts — institutional navy/charcoal for research, platinum white-gold for product, modern teal for wellness — or custom palettes from user input |
| **Typography** | Inter as the default sans-serif (titles + body with weight variation); Georgia or Cambria for institutional headers; strict size hierarchy (36–44pt titles, 14–16pt body, 10–12pt captions) |
| **Spacing** | Four style recipes — Sharp & Compact (0.3" margins, tight gaps for data decks), Soft & Balanced (0.4" margins for corporate), Rounded & Spacious (0.5" margins for marketing), Pill & Airy (0.6" margins for brand) |
| **Corner radius** | Consistent per recipe — 0" square for sharp, 0.08–0.12" for soft, 0.15–0.25" for rounded, 0.3–0.5" pill shapes |
| **Charts** | Native PptxGenJS charts (bar, line, pie, doughnut) plus custom shape-based capsule bars, overlapping column groups, and pill tags for dashboard-style slides |
| **Page badges** | Circle or pill page numbers on every non-cover slide at a fixed position |

### Deck Archetypes

| Archetype | Style Recipe | Palette | Key Features |
|-----------|-------------|---------|--------------|
| **Investment research / equity memo** | Sharp & Compact | Navy-charcoal institutional | Thesis-led titles (title = conclusion), sourced data on every quantitative slide, dense tables with header fills, KPI strips, comps grids, disclaimer slides, appendix |
| **Corporate / business update** | Soft & Balanced | Business authority (navy + red accent) | Clean hierarchy, moderate density, chart + takeaway layouts, professional but approachable |
| **Product / marketing** | Rounded & Spacious | Modern wellness or custom brand | Hero images, feature showcases, comparison cards, timeline flows, generous whitespace |
| **Brand / launch** | Pill & Airy | Platinum white-gold or custom | Premium feel, large display type, minimal text, strong visual anchors, pill-shaped components |
| **Technical / engineering** | Sharp or Soft | Neutral gray-blue | Architecture diagrams, code snippets, process flows, data tables, readable monospace for technical content |
| **Pitch deck / fundraise** | Soft & Balanced | Custom brand colors | Problem → solution → market → traction → team → ask flow, large stat callouts, competitor positioning |

### What Makes This Different From Template Filling

Excelor does not fill in a pre-made template. Each deck is **generated from scratch** by the LLM reasoning loop:

- **Layout variety.** The orchestrator enforces that no two consecutive content slides share the same layout — alternating between two-column, icon+text rows, 2×2 grids, half-bleed images, timeline flows, and data visualizations.
- **Content-aware design.** A slide about market size gets a chart treatment; a slide about competitive positioning gets a comparison layout; a slide about risks gets a structured list. The agent matches layout to content semantics.
- **Real data.** Financial data slides pull live numbers from APIs and SEC filings — not placeholder figures. Charts reflect actual data points.
- **Professional formatting.** Input assumptions in blue font, calculated values in black, section headers with borders, left-aligned body text, source citations on every data slide, page number badges, consistent margins — the same conventions used in institutional finance.

### Example: Investment Research Deck for Robinhood (HOOD)

**User prompt:** *"Create an investment research presentation for Robinhood (HOOD)."*

**What happens:**
1. The agent pulls HOOD financials — revenue, margins, user metrics, segment breakdown, key ratios, analyst estimates, insider trades.
2. Reads the latest 10-K for risk factors, management discussion, and business model detail.
3. Searches for competitive landscape data (Schwab, Interactive Brokers, Coinbase).
4. Selects the **investment research** archetype: institutional palette (#1a2332 navy, #2c3e50 charcoal, #5c6b7a cool gray, white background), Sharp & Compact spacing, Inter font stack.
5. Plans a 12-slide deck: Cover → Disclaimer → Executive Summary → Investment Thesis → Business Overview → Revenue Model → Financial Performance → Peer Comps → Valuation → Risks → Catalysts → Summary.
6. Spawns five sub-agents concurrently to generate slides — `cover-page-generator` for the opening, `financial-data-page-generator` for comps and financials, `content-page-generator` for narrative slides, `dashboard-chart-generator` for revenue and user growth charts, `summary-page-generator` for the close.
7. Compiles all slide modules into a single PPTX.
8. QA pass: extracts text, verifies no placeholders, checks source citations on data slides, confirms page numbers, validates layout variety.
9. Output: a polished, editable .pptx file ready for an investment committee or client presentation.

### Example: Product Launch Deck

**User prompt:** *"Build a 10-slide launch deck for a new AI-powered note-taking app called MindFlow."*

**What happens:**
1. The agent researches the note-taking market — competitors (Notion, Obsidian, Roam), market size, trends.
2. Selects the **brand launch** archetype: Pill & Airy style, custom brand palette derived from user input or auto-generated, generous whitespace.
3. Plans the deck: Cover → Problem → Solution (MindFlow) → Key Features (3 slides) → Market Opportunity → Traction / Roadmap → Team → Pricing → CTA / Next Steps.
4. Each feature slide uses a different layout: hero image + text overlay, icon grid with descriptions, before/after comparison.
5. Large stat callouts for market data (96pt numbers with 14pt labels below).
6. Compiles, QA checks, delivers a polished .pptx.

### Example: Quarterly Business Review

**User prompt:** *"Create a QBR deck for our SaaS company. Revenue was $4.2M (+18% QoQ), churn dropped to 3.1%, and we closed 47 new enterprise accounts."*

**What happens:**
1. The agent structures the deck around the provided metrics and researches any supplementary data needed.
2. Selects **Soft & Balanced** corporate style with a professional blue/gray palette.
3. Plans: Cover → Executive Summary → Revenue Deep-Dive → Customer Metrics → New Logos → Pipeline → Challenges & Risks → Next Quarter Goals → Appendix.
4. Revenue slide: waterfall chart showing QoQ growth by segment.
5. Customer metrics slide: KPI strip (3.1% churn, 47 new logos, NRR %) with trend sparklines.
6. Dashboard chart slide: MRR trend line, customer cohort analysis, expansion vs. contraction.
7. Delivers a complete PPTX with all charts reflecting the actual numbers provided.

---

## Page 11 — Web Browser, Search, and Internet Access

Excelor has full access to the open internet through three complementary tools — **web search**, **web fetch**, and a **real browser** — giving it the ability to find information, read pages, and interact with websites the same way a human researcher would.

### The Three-Layer Web Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                        WEB SEARCH                                │
│  Exa / Perplexity / Tavily — discover URLs and get snippets      │
│  X Search — real-time social sentiment from X/Twitter             │
├─────────────────────────────────────────────────────────────────┤
│                        WEB FETCH                                 │
│  One-shot page reader — HTML → markdown/text in a single call    │
│  Mozilla Readability extraction — 15-min LRU cache               │
├─────────────────────────────────────────────────────────────────┤
│                        BROWSER                                   │
│  Playwright (Chromium) — full interactive browsing               │
│  Navigate, snapshot (ARIA tree), click, type, scroll, read       │
│  Desktop: Electron built-in browser view  |  CLI: Playwright     │
└─────────────────────────────────────────────────────────────────┘
```

Each layer serves a distinct purpose, and the agent chooses the right tool for the task:

| Tool | What It Does | When the Agent Uses It |
|------|-------------|----------------------|
| `web_search` | Queries the web and returns ranked results with URLs and content snippets | Discovering relevant pages — news, company information, industry reports, current events, technology updates, historical stock prices |
| `x_search` | Searches X/Twitter for posts, threads, and discussions | Real-time sentiment, community discussion, trending topics, breaking developments |
| `web_fetch` | Fetches a known URL and extracts readable content (HTML → markdown) in a single call | Reading articles, press releases, earnings reports, documentation, blog posts — any static page where the URL is known |
| `browser` | Launches a full Chromium browser for interactive navigation | JavaScript-rendered SPAs, multi-step navigation (click links, fill forms, scroll), pages that require authentication, content that `web_fetch` cannot render |

### Web Search: Finding Information

The agent supports three search providers, selected based on which API key is configured (priority order: Exa → Perplexity → Tavily):

- Returns up to 5 results per query with URLs and content snippets.
- Queries are formulated by the LLM reasoning loop — not keyword-stuffed, but semantically targeted.
- Results feed into the agent's tool-calling loop: the agent searches, reads the most relevant results with `web_fetch`, and synthesizes findings.

**X/Twitter Search** runs independently when social sentiment matters — the agent searches for recent posts, analyst commentary, community discussion, and breaking news on X, then incorporates sentiment signals into its analysis.

### Web Fetch: Reading Pages

`web_fetch` is the default tool for reading any web page. It is fast, cacheable, and works in a single call:

- Fetches the URL, follows up to 3 redirects, and extracts readable content using **Mozilla Readability** (the same engine behind Firefox Reader View).
- Falls back to raw HTML → markdown conversion when Readability cannot extract.
- Handles HTML pages, JSON responses, and plain text.
- Results are cached in an **LRU cache** with a 15-minute TTL — repeated fetches of the same URL are instant.
- Output capped at 20,000 characters by default (configurable) to stay within context budgets.

### Browser: Full Interactive Web Access

When a page requires JavaScript rendering, authentication, or multi-step interaction, the agent launches a real browser:

**Dual backend architecture:**

| Channel | Backend | How It Works |
|---------|---------|-------------|
| **Desktop** | Electron built-in browser view | Actions proxied to Excelor's embedded browser via HTTP bridge with token auth (`x-excelor-browser-token`) |
| **CLI / WhatsApp / Gateway** | Playwright (Chromium) | Full headless or headed Chromium instance managed by the agent runtime |

**The browser workflow follows a structured protocol:**

1. **Navigate** — Load a URL (returns only URL and title, no content).
2. **Snapshot** — Capture the page's ARIA accessibility tree with clickable element refs (`e1`, `e2`, `e3`…). This is the agent's "eyes" — it sees the page structure, not pixels.
3. **Act** — Interact with elements using refs:
   - `click` — Click a link, button, or interactive element by ref
   - `type` — Fill a text input by ref
   - `press` — Press a keyboard key (Enter, Tab, Escape)
   - `hover` — Hover over an element to reveal tooltips or dropdowns
   - `scroll` — Scroll the page up or down
   - `wait` — Pause for dynamic content to load
4. **Snapshot again** — See the updated page after interaction.
5. **Read** — Extract full text content from the current page.
6. **Close** — Free browser resources when done.

The agent repeats the snapshot → act → snapshot loop as many times as needed to navigate through a website, fill out forms, or extract information from dynamic pages.

### What the Agent Can Do on the Web

| Capability | How It Works |
|-----------|-------------|
| **Research** | Search for a topic → read the top results → synthesize findings into a structured analysis |
| **Read earnings reports** | Fetch investor relations pages, parse press releases, extract financial tables |
| **Monitor news** | Search for breaking news on a company or sector, read full articles, summarize developments |
| **Navigate complex websites** | Log into platforms, click through multi-page flows, extract data from JavaScript-heavy dashboards |
| **Fill out web forms** | Navigate to a form, identify input fields via ARIA snapshot, type values, submit — used for job applications, account setup, content publishing |
| **Post to social media** | Navigate to LinkedIn/Twitter, compose content, attach files, publish — with snapshot verification of the published result |
| **Gather competitive intelligence** | Visit competitor websites, read product pages, extract pricing, compare feature matrices |
| **Verify information** | Cross-check claims against multiple sources — the agent does not trust a single search result |

### Example: Deep Research From a Single Question

**User prompt:** *"What's happening with the EU AI Act and how does it affect US tech companies?"*

**What happens:**
1. `web_search` finds the latest news articles, regulatory summaries, and analysis pieces on the EU AI Act.
2. `web_fetch` reads the top 3–5 results in full — extracting the regulatory timeline, compliance requirements, and enforcement mechanisms.
3. `x_search` pulls recent discussion from policy experts and tech executives on X.
4. The agent synthesizes everything: what the regulation requires, the compliance timeline, which US companies are most affected, estimated compliance costs, and strategic implications.
5. If a cited source leads to a deeper document (e.g., the official regulation text), the agent fetches and reads that too.
6. Output: a structured briefing with sourced claims, regulatory timeline, and company-specific impact analysis.

### Example: Automated Job Application

**User prompt:** *"Apply to this job posting on LinkedIn: [URL]. Use my resume at resume.pdf."*

**What happens:**
1. `browser` navigates to the LinkedIn job posting URL.
2. Snapshot reveals the page structure — job title, company, description, and the "Apply" button.
3. The agent clicks "Apply", triggering the application form.
4. Snapshot captures form fields: name, email, phone, resume upload, cover letter, work experience.
5. The agent reads `resume.pdf` to extract relevant details, then fills each form field using `type` actions with the appropriate refs.
6. Uploads the resume file through the browser file input.
7. Reviews the completed form via snapshot, then submits.
8. Final snapshot confirms the application was submitted successfully.

### Example: Competitive Pricing Research

**User prompt:** *"Compare the pricing of Notion, Obsidian, and Roam Research. Get their current plans and features."*

**What happens:**
1. The agent navigates to each product's pricing page using `browser` (pricing pages often require JavaScript).
2. Snapshots each page, extracts plan names, prices, and feature lists.
3. For pages with toggle switches (monthly/annual pricing), the agent clicks the toggle and snapshots again to capture both.
4. Synthesizes everything into a comparison matrix: plan tiers, pricing (monthly and annual), storage limits, collaboration features, API access, and unique differentiators.
5. Output: a formatted comparison table in XLSX or a structured text summary.

---

## Page 12 — WhatsApp Gateway

Excelor includes a full **WhatsApp messaging integration** built on Baileys (`@whiskeysockets/baileys`) — a lightweight WhatsApp Web API. This turns the agent into a conversational assistant reachable from your phone, and gives the desktop agent the ability to send messages and files outbound.

### Architecture

The gateway runs as a separate Bun process alongside the agent runtime. It handles session persistence, inbound message routing, outbound delivery, typing indicators, and markdown-to-WhatsApp formatting — all without a third-party service.

```
┌──────────────┐        ┌──────────────────────┐        ┌─────────────────┐
│  Your Phone  │◄──────▶│   WhatsApp Gateway   │◄──────▶│  Agent Runtime  │
│  (WhatsApp)  │        │   Bun process         │        │  localhost:27182│
│              │        │   Baileys sessions    │        │                 │
└──────────────┘        └──────────────────────┘        └─────────────────┘
```

### Setup

```bash
bun run gateway:login    # Scan QR code to link WhatsApp
bun run gateway          # Start listening for messages
```

Credentials are stored locally at `~/.excelor/credentials/whatsapp/default/`. Nothing is sent to external servers.

### Configuration

Gateway settings live in `~/.excelor/gateway.json`:

| Setting | Options | Purpose |
|---------|---------|---------|
| `allowFrom` | E.164 phone numbers | Whitelist of authorized senders |
| `groupPolicy` | `open`, `allowlist`, `disabled` | How group messages are handled |
| `groupAllowFrom` | Group IDs or `["*"]` | Which groups the agent responds in |
| `logLevel` | `silent`, `error`, `info`, `debug` | Gateway log verbosity |

### Inbound: Receiving Messages

The gateway processes plain text, extended text, and media captions from incoming WhatsApp messages. Messages are routed through `resolve-route` to the appropriate agent session. In groups, the agent **only responds when @-mentioned** via the WhatsApp mention picker — preventing noise and ensuring intentional interactions.

**Self-chat mode:** Message yourself on WhatsApp to interact with the agent privately, from anywhere.

### Outbound: The `send_whatsapp` Tool

The desktop agent can proactively push messages and files to WhatsApp:

| Parameter | Description |
|-----------|-------------|
| `message` | Plain text (max 3,000 chars) — mutually exclusive with `filePath` |
| `filePath` | Workspace file path for attachment (one file per call) |
| `caption` | Caption for file attachments (max 3,000 chars, requires `filePath`) |

Supported attachment types include PNG, JPG, PDF, DOCX, XLSX, and PPTX. The bridge automatically selects image vs. document payloads based on MIME type.

### Real-World Flow

1. User sends a WhatsApp message: *"How did AAPL do last quarter?"*
2. Gateway routes the message to the agent runtime.
3. Agent pulls financials, computes key metrics, and drafts a summary.
4. Text summary is sent back as a WhatsApp message with typing indicators.
5. The full spreadsheet analysis is sent as a document attachment.
6. The user reviews everything on their phone — never opening a laptop.

### Access Control

- **Phone-number allowlist** — only numbers in `allowFrom` can reach the agent.
- **Group mention-gating** — agent ignores group messages unless explicitly @-mentioned.
- **Token-based bridge auth** — outbound calls use `x-excelor-whatsapp-token` header.
- **Local sessions** — WhatsApp session data never leaves your machine.

---

## Page 13 — The Scratchpad and Audit Trail

Every agent run creates a persistent JSONL log under `.excelor/scratchpad/`. This is the **single source of truth** for debugging, replay, and compliance.

| Entry Type | Purpose |
|------------|---------|
| `init` | Session start with query and model |
| `tool_result` | Every tool invocation with arguments and output |
| `thinking` | Reasoning steps between tool calls |
| `compact_summary` | Compaction checkpoints preserving compressed context |
| `presentation_plugin` | Presentation workflow state tracking |
| `terminal` | Session end with final status and answer |

### Heartbeat: Cross-Session Memory

The heartbeat file (`~/.excelor/HEARTBEAT.md`) is a persistent markdown checklist the agent reads and updates across sessions. Unlike chat history (which resets per conversation), the heartbeat survives indefinitely — tracking ongoing projects, follow-ups, and reminders without the user re-explaining context.

---

## Page 14 — Privacy, Security, and Extensibility

### Privacy Model

| Guarantee | How |
|-----------|-----|
| **Local-first** | Agent runtime on localhost, no cloud dependency |
| **Your choice of LLM** | 15 providers, 2 fully local (Ollama, LM Studio) |
| **No telemetry** | Nothing sent to Excelor servers, ever |
| **Air-gapped mode** | Local model + no search keys = nothing leaves your network |
| **Audit trail** | Every tool call logged in scratchpad JSONL on your disk |
| **Filesystem sandbox** | All operations confined to workspace root, symlinks blocked |
| **Token-based auth** | Editor, browser, and WhatsApp bridges use separate auth tokens |
| **Access control** | WhatsApp allowlist by phone number, group mention-gating |

### Extensibility

| Extension | What It Adds | Hot-Reload |
|-----------|-------------|------------|
| **Skills** | Step-by-step guided workflows (markdown) | Yes |
| **Plugins** | Tools, skills, hooks, commands, agent personas | Yes |
| **MCP Connectors** | Model Context Protocol servers for additional data/actions | Via settings |
| **Custom Models** | Any OpenAI-compatible endpoint as a selectable model | Via settings |
| **Soul / Persona** | Personality and domain focus via markdown document | Via settings |

The agent itself can author new skills and plugins during a session, test them, and make them available immediately — closing the loop between execution and self-improvement.

---

## Page 15 — Technology Stack

| Layer | Technologies |
|-------|-------------|
| **Desktop** | Electron 33, React 19, TypeScript, Vite 7, Tailwind CSS 4, Framer Motion, Radix UI, Zustand, @assistant-ui/react |
| **Agent Runtime** | Bun, TypeScript, SSE, gray-matter, LangChain, Zod |
| **Gateway** | Bun, Baileys (@whiskeysockets/baileys) |
| **Document Engine** | OnlyOffice (Docker), Flask backend |
| **Presentations** | PptxGenJS |
| **Spreadsheets** | openpyxl (Python) |
| **Documents** | python-docx, docxtpl, Mammoth |
| **PDFs** | PyMuPDF, pdf-parse |
| **Browser** | Playwright (Chromium) |
| **Web Extraction** | @mozilla/readability, linkedom |
| **Financial Data** | financialdatasets.ai API, yfinance (Python) |
| **Caching** | In-memory LRU (web fetch), file-based JSON (financial API) |
| **Evaluation** | LangSmith, LLM-as-judge scoring |

---

## Page 16 — More Use Cases

### Use Case: Autonomous Web Form Filling

**Scenario:** A professional wants to maintain an active LinkedIn presence — publishing posts, sharing insights, and engaging with their network — without spending hours on the platform.

**What happens:**
1. The agent uses the browser tool to navigate to LinkedIn and authenticate via saved session.
2. Based on a user-provided topic or a scheduled content calendar, the LLM drafts a post — tailoring tone, length, and hashtags to the user's professional brand.
3. The browser tool opens the LinkedIn post composer using `navigate` + `snapshot`, identifies the text area and controls via ARIA snapshots, and fills in the content with `act` (click, type, press).
4. If the post includes an image or document (e.g., a chart, slide, or PDF generated earlier in the session), the agent attaches it through the browser upload flow.
5. The agent publishes the post and confirms success via a snapshot of the published result.
6. A heartbeat checklist tracks scheduled posts, published posts, and engagement follow-ups — persisting across sessions.

### Use Case: WhatsApp-Driven Research

**Scenario:** An analyst messages Excelor on WhatsApp from their phone: *"What's the latest on Tesla's Q4 earnings?"*

**What happens:**
1. The WhatsApp gateway routes the message to the agent runtime.
2. The agent searches the web, fetches the earnings report, and pulls financial data.
3. A concise summary with key metrics is sent back as a WhatsApp text message.
4. The full analysis spreadsheet is sent as a WhatsApp document attachment.
5. Access control ensures only authorized phone numbers can reach the agent.

### Use Case: Document Automation Pipeline

**Scenario:** *"Take the Q3 earnings data for Microsoft, build a spreadsheet model, create a 5-slide investment summary deck, export to PDF, and send the PDF to my WhatsApp."*

**What happens:**
1. Financial tools pull MSFT Q3 income statement, balance sheet, cash flow, and key ratios.
2. Spreadsheet tools build an XLSX workbook: revenue breakdown, margin trends, FCF waterfall, valuation multiples — with formulas and charts.
3. Presentation tools create a PPTX deck: title slide, financial highlights, competitive positioning, valuation summary, investment thesis.
4. The deck is exported to PDF.
5. `send_whatsapp` delivers the PDF to the user's phone.
6. Total: one prompt, four output formats, zero manual work.

---

*Excelor is distributed as open-source software (MIT license). Package version: excelor v1.0.0.*
