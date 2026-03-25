# Dexter Overview

This repo uses two names for the same runtime layer. The top-level [README.md](./README.md) calls the local agent runtime **Dexter**, but most implementation files, classes, env vars, and IPC names still use **Excelor**. In this workspace, those names refer to the same thing: the Bun-based agent runtime that Electron launches from [`dexter/`](./dexter/).

## 1. Naming And Architecture Snapshot

- [`desktop/`](./desktop/) is the Electron shell. It owns the desktop UI, starts Docker-backed services, runs bridge servers, and launches the local agent runtime.
- [`dexter/`](./dexter/) is the Bun/TypeScript runtime that serves agent requests, runs the tool loop, and writes agent-created `.pptx` files.
- [`shared/onlyoffice-presentation-spec.json`](./shared/onlyoffice-presentation-spec.json) is the shared presentation contract. Both the desktop app and Dexter read from it so they expose the same presentation tool names and prompt guidance.
- The most important practical distinction is this: spreadsheet/document/PDF editing is bridge-driven against a live OnlyOffice editor, while current PowerPoint generation is file-driven inside Dexter with PptxGenJS.

## 2. Runtime Flow From Desktop App To Dexter

The desktop app boots first. On startup, Electron main in [`desktop/main.js`](./desktop/main.js) installs the OnlyOffice editor interceptor, starts the local browser/editor bridge, initializes runtime instances, and brings up Docker services for OnlyOffice and the small backend noted in [README.md](./README.md). The runtime path is resolved in [`desktop/lib/excelor-runtime-paths.js`](./desktop/lib/excelor-runtime-paths.js), which looks for either `excelor/` or `dexter/`; in this repo it resolves to [`dexter/`](./dexter/).

Once paths are resolved, [`desktop/lib/excelor-process.js`](./desktop/lib/excelor-process.js) launches `bun run src/server.ts`, waits for `/health`, and restarts the process if needed. [`desktop/lib/excelor-runtime.js`](./desktop/lib/excelor-runtime.js) is the desktop-side HTTP client: it posts user turns to Dexter and consumes the streamed response, while [`desktop/main.js`](./desktop/main.js) wires in the bridge URLs, `EXCELOR_WORKSPACE_DIR`, and the runtime scope. The server entrypoint is [`dexter/src/server.ts`](./dexter/src/server.ts), which accepts the run request, creates or reuses conversation state, builds desktop context, and streams agent events back over SSE.

Key interfaces:

- `POST /run`: Dexter turn execution. The response is an SSE stream of `thinking`, `tool_*`, and final `done` events.
- `GET /health`: readiness probe used by the Electron-side process manager.
- `POST /editor/tool`: desktop bridge endpoint for editor-bound tools.

## 3. Agent Loop And Tool Execution

The core runtime is built in [`dexter/src/agent/agent.ts`](./dexter/src/agent/agent.ts). `Agent.create(...)` builds the system prompt, loads the soul/desktop context, and constructs the active tool registry through [`dexter/src/tools/registry.ts`](./dexter/src/tools/registry.ts). A run then creates a `RunContext`, which carries the query, scratchpad, token counter, subagent/thread metadata, and optional `pptxSession`.

The scratchpad in [`dexter/src/agent/scratchpad.ts`](./dexter/src/agent/scratchpad.ts) is the run's source of truth. It records the original query, tool results, thinking, terminal status, tool usage state, and presentation-population state in `.excelor/scratchpad/*.jsonl`. Each model iteration gets the current tool context back through the prompt, decides whether to call more tools, and either continues or produces the final answer.

Tool execution is handled by [`dexter/src/agent/tool-executor.ts`](./dexter/src/agent/tool-executor.ts). It normalizes tool names, applies guardrails, runs the tool inside `runContextStorage`, emits lifecycle events, and writes the result back to the scratchpad. That same mechanism is used for normal research tools, editor-bridge tools, and the special PowerPoint tool path.

## 4. PowerPoint Generation Flow

Current PowerPoint generation does **not** go through the live OnlyOffice presentation bridge. The special case is implemented in [`dexter/src/tools/onlyoffice.ts`](./dexter/src/tools/onlyoffice.ts): when the agent calls `createFile` with `format='pptx'`, Dexter bypasses `/editor/tool` and calls `createPptxTemplate(...)` in [`dexter/src/lib/pptx-tool-engine.ts`](./dexter/src/lib/pptx-tool-engine.ts).

`createPptxTemplate(...)` picks a workspace path from `EXCELOR_WORKSPACE_DIR` (or `process.cwd()`), creates a starter `.pptx`, and initializes `ctx.pptxSession` with:

- the output path
- an in-memory slide list
- the next synthetic shape id

After that, presentation tools such as `addSlide`, `setSlideText`, `formatSlideText`, `addShape`, `addChart`, `insertImage`, and `verifySlides` are still defined from the shared spec, but they are dispatched to `dispatchPptxTool(...)`, not to the OnlyOffice editor bridge. The deck exists as an in-memory slide model for the duration of the run. Each mutation rewrites the full `.pptx` to disk through `exportPptxToFile(...)`, because PptxGenJS is being used as a rebuild-from-model engine rather than as an in-place editor.

`verifySlides` runs `verifySlidesGeometry(...)` before the run finishes. That check looks for off-slide elements and overlapping boxes. The runtime also tracks whether the deck is still template-only, so `createFile(format='pptx')` by itself does not count as completion for a normal "generate a deck" request. The agent is expected to populate slides and then verify them.

After the run completes, the desktop layer in [`desktop/lib/excelor-runtime.js`](./desktop/lib/excelor-runtime.js) inspects the tool results. If it finds a successful PPTX `createFile` result and `open !== false`, it asks Electron main in [`desktop/main.js`](./desktop/main.js) to stage the file into OnlyOffice storage and open it in the editor.

Deck-generation entry points:

- `createFile(format='pptx')`: create the template file and initialize `pptxSession`
- presentation mutation tools: populate or change the in-memory slide model
- `verifySlides`: validate slide geometry before the run finishes

## 5. Current Path Vs Adjacent Legacy Bridge

For "generate a PowerPoint," the current path to understand is the PptxGenJS session in [`dexter/src/lib/pptx-tool-engine.ts`](./dexter/src/lib/pptx-tool-engine.ts). That is the file-generation pipeline Dexter uses today.

The desktop app still ships an embedded OnlyOffice presentation bridge and plugin stack in files such as [`desktop/lib/onlyoffice-editor-bridge.js`](./desktop/lib/onlyoffice-editor-bridge.js), [`plugin/scripts/presentation-bridge-core.js`](./plugin/scripts/presentation-bridge-core.js), and [`plugin-bridge/`](./plugin-bridge/). That bridge still matters for live editor automation and for the shared presentation contract, but it is not the same thing as Dexter's current PowerPoint-generation backend.

In short:

- spreadsheet/document/PDF editing tools still use the desktop bridge at `/editor/tool`
- the desktop app still ships the OnlyOffice presentation bridge/plugin and the shared presentation spec
- Dexter-generated PowerPoints currently come from the in-process PptxGenJS session, not from live OnlyOffice slide editing
