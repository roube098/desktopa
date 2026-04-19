# AI agent guide — `cowork - Copy` workspace

## Purpose

**Excelor** in this workspace is an **equity research AI assistant**: it is meant to support people who work with public companies, markets, and documents—primarily **equity research analysts**, **portfolio managers**, and **risk analysts**. Features, prompts, and tools should favor grounded financial workflows (filings, metrics, valuation-style skills, documents, decks) and clear sourcing—not generic chat. When in doubt, prioritize accuracy, citations or tool-backed facts, and workflows that fit buy-side or sell-side research and risk oversight.

This directory is a **multi-project workspace**, not a single npm package. Treat each subfolder as its own product unless a task explicitly spans multiple projects.

## Layout

| Path | Role |
|------|------|
| **`dexter/`** | **Excelor** — CLI agent for **deep financial / equity research** (Bun/TypeScript, Ink UI, tool loop, prompts under `src/agent/`). Primary agent codebase. |
| **`desktop/`** | **Excelor Desktop** — Electron + Vite app (“AI-powered document editor”). Separate `package.json`; Node/npm oriented. |
| **`pdf/`** | Standalone **Electron PDF reader** project (`ai-pdf-reader`). Independent deps and scripts. |
| **`slides_workspace/`** | Small **PptxGenJS / slides** utilities (`pptxgenjs`, skia-canvas, etc.). Minimal scripts. |
| **`Plugins/`** | Plugin examples and assets (e.g. `pptx-skills`). |

Nested **`dexter/AGENTS.md`** is the detailed guide for the Excelor CLI (structure, commands, tools, skills, local doc/xlsx/pdf workers). **Read that file before changing anything under `dexter/`.**

## Which tree to edit

- User asks about **prompts, agent loop, tools, skills, CLI** → work in **`dexter/`** and follow **`dexter/AGENTS.md`**.
- User asks about **desktop UI, Electron, Vite** → work in **`desktop/`**; run commands from `desktop/` (see its `package.json` scripts).
- User asks about the **standalone pdf app** → **`pdf/`** only.
- User asks about **slide generation helpers** → **`slides_workspace/`** or **`Plugins/`** as appropriate.

Do not run `bun install` at the workspace root expecting one lockfile; install **inside** the relevant project directory.

## Quick commands (by project)

### `dexter/` (Excelor CLI)

- Install: `bun install` (from `dexter/`)
- Dev: `bun run dev`
- Typecheck: `bun run typecheck`
- Tests: `bun test`

### `desktop/` (Electron)

- Install: `npm install` (from `desktop/`)
- Dev: `npm run dev` (Vite + Electron)
- Typecheck: `npm run typecheck`
- Unit tests: `npm run test:unit`

### `pdf/`

- Install: `npm install` (from `pdf/`)
- Dev / start per `pdf/package.json` (Electron; paths and env may be POSIX-oriented in scripts)

### `slides_workspace/`

- Install: `npm install` if you need to run or extend it; no standard test script in `package.json`.

## Conventions for AI agents

- **Audience**: assume users may be **equity research**, **portfolio management**, or **risk** professionals—prefer precise numbers, explicit assumptions, and reproducible steps; avoid hand-wavy investment advice or unsourced claims.
- **Scope changes** to the minimum project and files needed; avoid drive-by edits across `dexter/`, `desktop/`, and `pdf/` in one go unless the user asked for integration.
- **Secrets**: never commit `.env`, API keys, or real tokens. Use `env.example` patterns where they exist under each project.
- **Documentation**: do not add new markdown files unless the user requests them; this `AGENTS.md` is the workspace-level exception for agent orientation.
- **Prompts** (Excelor): main assembly is `dexter/src/agent/prompts.ts`; channel profiles in `dexter/src/agent/channels.ts`; subagent roles in `dexter/src/subagents/roles.ts`.

## Related docs

- Excelor CLI deep dive: **`dexter/AGENTS.md`**
- Upstream reference (if applicable): remote repo noted in `dexter/AGENTS.md`
