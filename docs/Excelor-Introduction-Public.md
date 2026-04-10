# Excelor: an introduction

**Excelor** is a desktop app that brings together an AI assistant, your documents, and optional connections (like messaging or research tools) in one place on your computer. It is built to help you work through complex tasks—writing, analysis, spreadsheets, presentations, and more—without juggling a dozen separate websites.

This page is written for anyone who wants to understand what Excelor is, what it can do, and when it is useful—not how it is built.

---

## What you get

- **A focused workspace** where you chat with an AI that can use tools: search the web, work with files in your workspace, help edit documents, and run longer multi-step jobs.
- **Real document editing** for common office formats (spreadsheets, documents, presentations, PDFs) so you are not limited to plain text in a chat box.
- **Your machine, your choice** about the cloud: you can use online AI services if you want, or connect to AI that runs entirely on your computer for stronger privacy.
- **Optional add-ons** such as skills (guided workflows), plugins, and integrations you turn on when you need them.
- **WhatsApp messaging** so the assistant can reach you—or you can reach it—directly from your phone.
- **Sub-agents** that split complex jobs into parallel tracks, each with its own specialty, reporting back to a coordinator.

Excelor is meant to feel like a capable assistant that stays in your workflow—not a generic chat window.

---

## How it fits into your day

### Financial research and analysis

Excelor was designed with financial work as a first-class use case. You can ask the assistant to:

- **Look up live and historical stock or crypto prices** and present them in a chart or spreadsheet.
- **Pull financial statements** (income, balance sheet, cash flow) for any public company, compare ratios across competitors, and summarise the results.
- **Read SEC filings** (10-K, 10-Q, 8-K) and answer questions about specific sections—risk factors, management discussion, segment revenue breakdowns—without you having to scroll through hundreds of pages.
- **Run a DCF valuation** end-to-end: gather inputs, choose sector-appropriate discount rates, build a model in a spreadsheet, and run sensitivity tables. A built-in "DCF Valuation" skill guides the process step by step.
- **Track insider trades and analyst estimates** for a ticker, so you can see what insiders are buying or selling and where the consensus sits.
- **Monitor crypto markets** at minute, daily, or weekly intervals and backtest investment strategies against historical data—calculating returns, drawdowns, Sharpe ratios, and win rates.

All financial data is cached locally so repeated lookups are fast and free.

### Web research and information gathering

- **Search the web** using whichever backend you configure (Exa, Perplexity, or Tavily). The assistant picks the best query, retrieves results, and summarises them—with source links.
- **Fetch and read any web page**, extracting the article text cleanly (stripping ads and navigation) so you get the substance.
- **Search X / Twitter** for sentiment, profiles, or full threads on a topic. A built-in "X Research" skill structures this into a sourced briefing.
- **Browse interactively**: the assistant can open a full browser, navigate pages, click buttons, fill forms, scroll, and take snapshots—useful for sites that do not have APIs.

### Office documents — create, edit, export

Excelor embeds a full office suite (OnlyOffice) so you can work with real files, not just chat text.

| Format | What the assistant can do |
|--------|---------------------------|
| **Spreadsheets** (.xlsx) | Write cell values and formulas, format ranges, insert or delete rows and columns, create bar / line / pie charts, add sheets, read data back for validation. |
| **Documents** (.docx) | Insert and format text, build tables, apply find-and-replace, create bulleted or numbered lists, insert page breaks, render templates with variable substitution. |
| **Presentations** (.pptx) | Build slide decks from scratch or from templates—add text, shapes, charts, and images; manage slide order; apply professional colour palettes and font pairings. Specialised skills exist for investment research decks, dashboards with charts, and multi-slide orchestration. |
| **PDFs** | Extract text, add annotations and highlights, stamp or watermark pages, and render pages to images for visual review. |

You can also ask the assistant to **create a new file** in any of these formats directly from chat, or **export the current document to PDF**.

### Browser automation and form filling

Because the assistant can drive a real browser, it is useful for tasks that normally require you to sit and click:

- **Fill out multi-step web forms** (job applications, registrations, surveys) by reading the page structure and typing into the right fields.
- **Monitor a website for changes**—prices, stock availability, regulatory filings—and alert you when something shifts.
- **Collect structured data** from pages that do not offer a download option, saving the results into your workspace.
- **Navigate authenticated sites** (where you are already logged in) to perform actions on your behalf.

### WhatsApp integration

With the optional WhatsApp gateway, Excelor becomes reachable from your phone:

- **Message yourself** on WhatsApp to chat with the assistant privately, wherever you are.
- **Receive files** the assistant created (spreadsheets, reports, slides) as WhatsApp attachments.
- **Enable group support** so the assistant responds when @-mentioned in a WhatsApp group—useful for teams.
- **Access control** is built in: you define who can reach the assistant by phone number, and how group messages are handled.

### Multi-step and delegated work

For bigger jobs, Excelor goes beyond single-turn chat:

- **Sub-agents**: the assistant can spin up to six parallel workers, each with a defined role (e.g. "research competitor A", "build the spreadsheet model", "draft the executive summary"), and then stitch the results together.
- **Heartbeat checklist**: a persistent markdown note the assistant maintains across sessions—so it can track ongoing projects, follow-ups, and reminders without you having to re-explain context every time.
- **Skills**: guided workflows (like the DCF valuation or X research skills) that encode best practices into repeatable, step-by-step processes.
- **Plugins**: community or self-authored packages that add new tools, skills, hooks, and even custom agent personas. The assistant can create plugins for itself, test them, and immediately start using them.

### Everyday productivity

Beyond the specialised features above, Excelor is useful as a general-purpose assistant:

- **Draft or revise** emails, memos, reports, blog posts—anything text-based.
- **Summarise long documents** or web pages into concise bullet points.
- **Compare data** across files in your workspace by reading multiple documents and highlighting differences.
- **Automate repetitive tasks** that would otherwise require switching between several apps—copy data from a website into a spreadsheet, format it, chart it, export to PDF, and send it via WhatsApp, all in one conversation.

---

## What it does not claim to be

Excelor is a powerful tool, but it is not a replacement for professional advice (legal, medical, financial). Always verify important outputs yourself. The assistant can make mistakes, especially with numbers or rapidly changing data—treat its work the way you would treat a draft from a capable but fallible colleague.

---

## Choose your AI provider

Excelor supports **15 LLM providers** out of the box. You pick the one that suits your needs:

| Category | Providers |
|----------|-----------|
| **Cloud** | OpenAI, Anthropic (Claude), Google (Gemini), xAI (Grok), DeepSeek, Moonshot (Kimi), Z.AI, MiniMax |
| **Proxy** | OpenRouter (routes to hundreds of models), LiteLLM |
| **Enterprise cloud** | AWS Bedrock, Google Vertex AI, Azure AI Foundry |
| **Local / offline** | Ollama, LM Studio — run models entirely on your machine for full privacy |

Switch providers or models at any time from the settings panel or with a quick command in chat.

---

## Privacy and data in plain terms

- **Local-first design** means the app and much of the "thinking" infrastructure can run on your PC. Data you do not send to an external service stays local.
- **If you choose a cloud AI provider**, your prompts and files sent to that provider are handled under *their* policies. You control which provider and model you use in settings.
- **Your workspace** is a folder of files on your computer that Excelor can work with; you stay in charge of what gets shared or uploaded.
- **No telemetry** is sent to Excelor servers. Every tool call and result is logged locally in a scratchpad for your own audit and debugging.
- **Air-gapped mode** is fully supported: pair Ollama or LM Studio with no search or cloud keys configured, and nothing leaves your network.

---

## What "desktop app" means for you

Excelor installs like other Windows software. You open it from your computer, not only from a browser tab. That usually means faster access to your files and clearer boundaries between "my machine" and "the internet."

Some features rely on optional background pieces (for example, the document editing service or the WhatsApp messaging bridge). If something is not set up, the app will tell you what is missing in everyday language in the interface—not in error codes.

---

## Extensibility at a glance

| Extension type | What it adds | Where it lives |
|----------------|-------------|----------------|
| **Skills** | Step-by-step guided workflows (e.g. DCF valuation, Twitter research) | Built-in, user-created, or from plugins |
| **Plugins** | New tools, skills, hooks, commands, and agent personas—bundled as a folder | Built-in, user, project, or external paths |
| **MCP Connectors** | Connect to any Model Context Protocol server for additional data or actions | Configured in settings |
| **Custom models** | Register any OpenAI-compatible endpoint as a selectable model | Settings → Custom Models |
| **Soul / persona** | Customise the assistant's personality and domain focus via a markdown document | Settings → Soul |

The assistant itself can author new skills and plugins during a session, test them, and make them available immediately—no restart required.

---

## Want more detail?

- **Full product capabilities** (features, tools, and integrations in depth): see [EXCELOR_CAPABILITIES.md](../EXCELOR_CAPABILITIES.md) in this repository. That document is longer and more detailed; it is aimed at people who want the full picture.
- **Technical architecture** (for developers and IT): see [Excelor-Desktop-Technical-Reference.md](./Excelor-Desktop-Technical-Reference.md).

---

*Excelor is distributed as open-source software (MIT license). Package version and build details appear in the app's about or settings area.*
