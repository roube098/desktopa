"""
Multipage technical deep-dive PDF for the Excelor desktop application.
Run from repo root: python scripts/generate-excelor-technical-deep-dive.py
"""
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    LongTable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT = REPO_ROOT / "output" / "pdf" / "Excelor-Technical-Deep-Dive.pdf"

# Keep in sync with ipcMain.handle("...") in desktop/main.js
IPC_MAIN_HANDLES_SORTED = sorted(
    [
        "add-custom-model",
        "add-mcp-connector",
        "browser-go-back",
        "browser-go-forward",
        "browser-hide",
        "browser-load-excelor",
        "browser-navigate",
        "browser-open-external",
        "browser-reload",
        "browser-show",
        "browser-stop",
        "check-financial-mcp-provider",
        "check-mcp-connector",
        "connect-financial-mcp-provider",
        "connect-provider",
        "create-workspace-file",
        "delete-mcp-connector",
        "disconnect-financial-mcp-provider",
        "disconnect-mcp-connector",
        "disconnect-provider",
        "excelor-abort-turn",
        "excelor-bootstrap",
        "excelor-launch",
        "excelor-list-subagents",
        "excelor-run-turn",
        "excelor-update-context",
        "fetch-provider-models",
        "get-active-provider-config",
        "get-custom-models",
        "get-financial-mcp-providers",
        "get-financial-settings",
        "get-merged-models",
        "get-mcp-connectors",
        "get-plugin-tree",
        "get-plugins",
        "get-ports",
        "get-provider-meta",
        "get-provider-settings",
        "get-skill-tree",
        "get-skills",
        "get-status",
        "list-workspace-files",
        "login-openai-with-chatgpt",
        "open-pdf-in-onlyoffice",
        "open-plugin-in-editor",
        "open-skill-in-editor",
        "open-workspace-file",
        "pdf:extractText",
        "pdf:extractTextFromBuffer",
        "read-plugin-file",
        "read-skill-file",
        "remove-custom-model",
        "resync-plugins",
        "resync-skills",
        "restart-services",
        "set-active-provider",
        "set-mcp-connector-enabled",
        "set-plugin-enabled",
        "set-skill-enabled",
        "show-plugin-in-folder",
        "show-skill-in-folder",
        "store-api-key",
        "sync-financial-mcp-providers",
        "test-lmstudio-connection",
        "test-ollama-connection",
        "update-financial-settings",
        "update-provider-model",
        "validate-api-key",
    ]
)


def add_footer(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#64748b"))
    w, h = LETTER
    canvas.drawString(0.65 * inch, 0.42 * inch, "Excelor desktop technical reference")
    canvas.drawRightString(w - 0.65 * inch, 0.42 * inch, f"Page {canvas.getPageNumber()}")
    canvas.restoreState()


def make_styles():
    base = getSampleStyleSheet()
    title = ParagraphStyle(
        "T",
        parent=base["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=26,
        leading=30,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=8,
    )
    subtitle = ParagraphStyle(
        "Sub",
        parent=base["Normal"],
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#475569"),
        spaceAfter=20,
    )
    h1 = ParagraphStyle(
        "H1",
        parent=base["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=17,
        textColor=colors.HexColor("#0f172a"),
        spaceBefore=0,
        spaceAfter=8,
    )
    h2 = ParagraphStyle(
        "H2",
        parent=base["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=13,
        textColor=colors.HexColor("#1e293b"),
        spaceBefore=12,
        spaceAfter=5,
    )
    body = ParagraphStyle(
        "B",
        parent=base["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#334155"),
    )
    small = ParagraphStyle(
        "S",
        parent=base["Normal"],
        fontSize=8,
        leading=10.5,
        textColor=colors.HexColor("#475569"),
    )
    mono = ParagraphStyle(
        "M",
        parent=base["Code"],
        fontName="Courier",
        fontSize=7.5,
        leading=9,
        textColor=colors.HexColor("#0f172a"),
        leftIndent=8,
    )
    return title, subtitle, h1, h2, body, small, mono


def tbl(rows, col_widths, header=True):
    t = Table(rows, colWidths=col_widths)
    style_cmds = [
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
    ]
    if header and rows:
        style_cmds.extend(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ]
        )
    t.setStyle(TableStyle(style_cmds))
    return t


def appendix_ipc_handle_table() -> LongTable:
    rows = [["ipcMain.handle channel"]] + [[name] for name in IPC_MAIN_HANDLES_SORTED]
    lt = LongTable(rows, colWidths=[6.2 * inch], repeatRows=1)
    lt.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                ("FONTSIZE", (0, 0), (-1, -1), 7.5),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
                ("FONTNAME", (0, 1), (-1, -1), "Courier"),
            ]
        )
    )
    return lt


def build_story(title, subtitle, h1, h2, body, small, mono):
    story = []

    # --- Cover ---
    story.append(Spacer(1, 1.2 * inch))
    story.append(Paragraph("Excelor", title))
    story.append(
        Paragraph(
            "Desktop application - multipage technical deep dive",
            subtitle,
        )
    )
    story.append(
        Paragraph(
            "Electron shell, React renderer, Bun/TypeScript agent runtime (HTTP+SSE), "
            "OnlyOffice document engine, plugins, skills, and provider integrations.",
            body,
        )
    )
    story.append(Spacer(1, 0.4 * inch))
    story.append(
        HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e2e8f0"), spaceBefore=6, spaceAfter=12)
    )
    story.append(Paragraph("Document scope", h2))
    story.append(
        Paragraph(
            "This PDF focuses on the <b>desktop</b> package: main process, preload IPC, renderer UX, "
            "and how the app talks to local services. Agent-runtime tools, gateway behavior, and "
            "Dexter server details are summarized at overview depth; see EXCELOR_CAPABILITIES.md in "
            "the repository for exhaustive tool lists.",
            body,
        )
    )
    story.append(Spacer(1, 8))
    story.append(
        Paragraph(
            "Package: excelor v1.0.0 (desktop/package.json) - MIT. "
            "Generated for architecture reviews and onboarding.",
            small,
        )
    )
    story.append(PageBreak())

    # --- Architecture ---
    story.append(Paragraph("1. Layered architecture", h1))
    story.append(
        Paragraph(
            "The UI is an Electron app. The <b>renderer</b> (Vite + React) never talks to LLMs directly "
            "for agent turns; it invokes IPC handlers that proxy to a local <b>ExcelorRuntime</b> HTTP "
            "client. The Bun server (Dexter) exposes SSE streams, tool execution, and scratchpad logging.",
            body,
        )
    )
    story.append(Spacer(1, 6))
    arch_ascii = """\
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
+-------------------+"""
    for line in arch_ascii.splitlines():
        story.append(Paragraph(line.replace("&", "&amp;"), mono))
    story.append(Spacer(1, 8))
    story.append(Paragraph("1.1 Default ports and scopes", h2))
    port_rows = [
        ["Variable / scope", "Default", "Role"],
        ["EXCELOR_PORT / main scope", "27182", "Primary agent runtime for main UI thread"],
        ["EXCELOR_ONLYOFFICE_PORT / onlyoffice scope", "27183", "Separate runtime bound to editor context"],
        ["Backend / OnlyOffice (UI status)", "8090 / 8080", "Shown in App.tsx initial ports until resolved"],
    ]
    story.append(tbl(port_rows, [2.1 * inch, 0.95 * inch, 2.75 * inch]))
    story.append(PageBreak())

    # --- Main process ---
    story.append(Paragraph("2. Electron main process responsibilities", h1))
    story.append(
        Paragraph(
            "main.js owns BrowserWindow, optional WebContentsView for embedded browsing, tray integration, "
            "Docker lifecycle for OnlyOffice, workspace file IO under the user Documents path, PDF text "
            "extraction via pdf-parse, and all ipcMain handlers exposed through preload.",
            body,
        )
    )
    story.append(Paragraph("2.1 Workspace and OnlyOffice", h2))
    story.append(
        Paragraph(
            "Workspace root defaults to <font name='Courier'>Documents/My Workspace</font>. "
            "OnlyOffice container name <font name='Courier'>spreadsheet-ai-onlyoffice</font>; "
            "example files path bridges host Docker paths to editor URLs. Supported extensions include "
            "office formats, PDF, CSV, Markdown, and plain text.",
            body,
        )
    )
    story.append(Paragraph("2.2 ExcelorRuntime (lib/excelor-runtime.js)", h2))
    story.append(
        Paragraph(
            "Wraps HTTP calls to the Bun server: bootstrap, run-turn, launch, abort, list subagents, "
            "update context. Injects provider API keys from environment (OPENAI_API_KEY, ANTHROPIC_API_KEY, "
            "GOOGLE_API_KEY, XAI_API_KEY, DEEPSEEK_API_KEY, MOONSHOT_API_KEY, ZAI_API_KEY, OPENROUTER_API_KEY) "
            "when launching the subprocess. Infers provider from model id prefixes (claude-, gemini-, grok-, etc.).",
            body,
        )
    )
    story.append(PageBreak())

    # --- IPC ---
    story.append(Paragraph("3. Preload IPC surface (electronAPI)", h1))
    story.append(
        Paragraph(
            "contextBridge exposes a stable API to the renderer. Below: channel names grouped by concern.",
            body,
        )
    )
    story.append(Paragraph("3.1 Services and lifecycle", h2))
    ipc_svc = [
        ["Channel", "Type", "Purpose"],
        ["get-status", "invoke", "Backend / OnlyOffice status"],
        ["get-ports", "invoke", "Resolved ports including editor bridge"],
        ["restart-services", "invoke", "Restart local services"],
        ["service-status, ports-resolved, services-ready, service-error", "on", "Push status to renderer"],
    ]
    story.append(tbl(ipc_svc, [2.4 * inch, 0.65 * inch, 2.55 * inch]))
    story.append(Paragraph("3.2 Embedded browser", h2))
    ipc_br = [
        ["browser-show", "invoke", "Position WebContentsView with bounds"],
        ["browser-hide", "invoke", "Hide embedded browser"],
        ["browser-navigate, browser-load-excelor, browser-go-back, browser-go-forward", "invoke", "Navigation"],
        ["browser-reload, browser-stop, browser-open-external", "invoke", "Reload / stop / system browser"],
        ["browser-state-changed", "on", "URL and loading state"],
    ]
    story.append(tbl(ipc_br, [2.8 * inch, 0.65 * inch, 2.15 * inch]))
    story.append(Paragraph("3.3 Excelor agent bridge", h2))
    ipc_ex = [
        ["excelor-bootstrap", "invoke", "Scope-aware bootstrap"],
        ["excelor-run-turn, excelor-launch, excelor-abort-turn", "invoke", "Turn execution and cancel"],
        ["excelor-list-subagents", "invoke", "Subagent listing"],
        ["excelor-update-context", "invoke", "Document / editor context for prompts"],
        ["excelor-snapshot", "on", "Streaming state to UI"],
        ["excelor-apply-subagent-tool / respondExcelorSubagentTool", "on / send", "Subagent tool round-trip"],
    ]
    story.append(tbl(ipc_ex, [2.5 * inch, 0.65 * inch, 2.45 * inch]))
    story.append(PageBreak())

    story.append(Paragraph("3.4 Workspace files", h2))
    ipc_ws = [
        ["Channel", "Kind"],
        ["list-workspace-files, create-workspace-file, open-workspace-file", "invoke"],
        ["workspace-files-changed", "on"],
    ]
    story.append(tbl(ipc_ws, [4.5 * inch, 1.35 * inch]))
    story.append(Paragraph("3.5 Providers and models", h2))
    story.append(
        Paragraph(
            "invoke handlers for multi-provider configuration, OAuth for OpenAI, API key storage, "
            "and model selection.",
            body,
        )
    )
    story.append(Paragraph("3.6 Skills and plugins", h2))
    story.append(
        Paragraph(
            "get-skills, set-skill-enabled, resync-skills, get-skill-tree, read-skill-file, "
            "open-skill-in-editor, show-skill-in-folder, skills-changed. "
            "get-plugins, set-plugin-enabled, resync-plugins, get-plugin-tree, read-plugin-file, "
            "open-plugin-in-editor, show-plugin-in-folder.",
            body,
        )
    )
    story.append(Paragraph("3.7 MCP and financial connectors", h2))
    story.append(
        Paragraph(
            "MCP: get-mcp-connectors, add-mcp-connector, delete-mcp-connector, set-mcp-connector-enabled, "
            "check-mcp-connector, disconnect-mcp-connector. "
            "Financial: get-financial-settings, update-financial-settings, get-financial-mcp-providers, "
            "connect-financial-mcp-provider, disconnect-financial-mcp-provider, check-financial-mcp-provider, "
            "sync-financial-mcp-providers.",
            body,
        )
    )
    story.append(Paragraph("3.8 PDF helpers", h2))
    story.append(
        Paragraph(
            "open-pdf-in-onlyoffice, pdf:extractText, pdf:extractTextFromBuffer (base64) for chat context.",
            body,
        )
    )
    story.append(Paragraph("3.9 Local LLM tests and custom models", h2))
    story.append(
        Paragraph(
            "test-ollama-connection, test-lmstudio-connection, get-custom-models, add-custom-model, "
            "remove-custom-model, get-merged-models.",
            body,
        )
    )
    story.append(PageBreak())

    # --- HTTP agent ---
    story.append(Paragraph("4. Agent runtime HTTP (Bun server)", h1))
    http_rows = [
        ["Method", "Path", "Purpose"],
        ["POST", "/run", "Agent turn with SSE event stream"],
        ["GET", "/health", "Health"],
        ["POST", "/abort", "Cancel run"],
        ["POST", "/editor/tool", "Tools that need editor coupling"],
        ["POST", "/plugins/refresh", "Hot-reload plugins"],
    ]
    story.append(tbl(http_rows, [0.75 * inch, 1.45 * inch, 3.5 * inch]))
    story.append(Spacer(1, 8))
    story.append(Paragraph("4.1 Representative SSE event types", h2))
    sse_rows = [
        ["Event", "Meaning"],
        ["thinking", "Reasoning step"],
        ["tool_start / tool_end / tool_error / tool_progress", "Tool lifecycle"],
        ["tool_approval / tool_denied", "Human approval gates"],
        ["response_delta", "Final answer tokens"],
        ["context_cleared / compact", "Compaction"],
        ["subagent_spawned / subagent_closed", "Subagents"],
        ["done", "Turn complete with metadata"],
    ]
    story.append(tbl(sse_rows, [1.55 * inch, 4.15 * inch]))
    story.append(PageBreak())

    # --- Agent internals ---
    story.append(Paragraph("5. Agent loop and memory (runtime)", h1))
    story.append(
        Paragraph(
            "Iterative tool-calling loop: load registry, system prompt (soul, skills, desktop context), "
            "stream model, execute tools, write scratchpad JSONL under .excelor/scratchpad/, apply "
            "micro-compaction and auto-compaction when context exceeds thresholds. "
            "Default max iterations: unbounded (Infinity) until natural completion.",
            body,
        )
    )
    story.append(Paragraph("5.1 Subagents", h2))
    story.append(
        Paragraph(
            "Tools: spawn_agent, send_input, resume_agent, wait, close_agent. "
            "Limits: max 6 concurrent subagent threads, nesting depth 1 (no nested spawn from subagents).",
            body,
        )
    )
    story.append(Paragraph("5.2 Filesystem tool sandbox (runtime)", h2))
    story.append(
        Paragraph(
            "Workspace root from EXCELOR_WORKSPACE_DIR or cwd; paths must stay under root; "
            "symlink components rejected; read_file line limits and size caps apply.",
            body,
        )
    )
    story.append(PageBreak())

    # --- Renderer ---
    story.append(Paragraph("6. Renderer application structure", h1))
    story.append(
        Paragraph(
            "App.tsx composes Titlebar, Dashboard, LeftSidebar, MyThread (assistant-ui runtime), "
            "embedded browser host, OnlyOffice iframe, Settings. "
            "centerMode switches: dashboard, browser, editor, settings. "
            "Streaming: streamExcelorAssistantTurn bridges SSE into assistant-ui adapters.",
            body,
        )
    )
    story.append(
        Paragraph(
            "Attachments: CompositeAttachmentAdapter with image, text, and PDF adapter for context.",
            body,
        )
    )
    story.append(PageBreak())

    # --- Providers table ---
    story.append(Paragraph("7. LLM providers (platform overview)", h1))
    story.append(
        Paragraph(
            "UI may list many providers; agent runtime wiring in desktop focuses on env-injected keys "
            "for OpenAI-class providers plus Ollama/OpenRouter. Full matrix in product docs.",
            body,
        )
    )
    prov_rows = [
        ["Provider", "Routing hint", "Notes"],
        ["OpenAI", "default", "gpt-*, o*, etc."],
        ["Anthropic", "claude- prefix", "Prompt cache supported in runtime"],
        ["Google", "gemini- prefix", ""],
        ["xAI", "grok- prefix", ""],
        ["DeepSeek", "deepseek- prefix", ""],
        ["Moonshot", "kimi- prefix", ""],
        ["Z.AI", "zai: prefix", ""],
        ["OpenRouter", "openrouter: prefix", "Proxy to many models"],
        ["Ollama", "ollama: prefix", "Local"],
        ["Others", "Bedrock, Vertex, Azure, LM Studio, LiteLLM", "Often via UI or gateway paths"],
    ]
    story.append(tbl(prov_rows, [1.1 * inch, 1.35 * inch, 3.25 * inch]))
    story.append(PageBreak())

    # --- Tools overview ---
    story.append(Paragraph("8. Agent tool domains (summary)", h1))
    story.append(
        Paragraph(
            "Tools are assembled dynamically. Major domains: financial research (financialdatasets.ai API), "
            "Yahoo via yfinance worker, web search (Exa, Perplexity, Tavily by key priority), "
            "web_fetch with Readability, X search, browser (Playwright or desktop bridge), filesystem "
            "read/write/edit, spreadsheet (openpyxl), Word and PPTX pipelines, PDF manipulation, "
            "WhatsApp send_whatsapp, heartbeat, skill invoker.",
            body,
        )
    )
    story.append(Paragraph("8.1 Browser tool and desktop bridge", h2))
    story.append(
        Paragraph(
            "When EXCELOR_BROWSER_BRIDGE_URL is set, browser automation targets the Electron bridge; "
            "otherwise Playwright launches Chromium. Actions include navigate, snapshot, act (click, type, "
            "press, hover, scroll, wait), read, close.",
            body,
        )
    )
    story.append(PageBreak())

    # --- Gateway ---
    story.append(Paragraph("9. WhatsApp gateway (separate process)", h1))
    story.append(
        Paragraph(
            "Baileys-based gateway: bun run gateway, session in ~/.excelor/credentials/whatsapp/default/, "
            "config ~/.excelor/gateway.json (allowFrom, groupPolicy, groupAllowFrom). "
            "Inbound routing via resolve-route; outbound send_whatsapp uses bridge URL and "
            "x-excelor-whatsapp-token header.",
            body,
        )
    )
    story.append(Paragraph("9.1 Heartbeat file", h2))
    story.append(
        Paragraph(
            "Agent heartbeat tool reads/writes ~/.excelor/HEARTBEAT.md for persistent checklists.",
            body,
        )
    )
    story.append(PageBreak())

    # --- Build ---
    story.append(Paragraph("10. Build and development", h1))
    build_rows = [
        ["Script", "Purpose"],
        ["npm run dev:vite", "Vite dev server"],
        ["npm run dev:electron", "Electron with VITE_DEV_SERVER_URL"],
        ["npm run build", "vite build && electron-builder --win"],
        ["npm run test:unit", "Node test runner on tests/*.test.js"],
        ["npm run typecheck", "tsc --noEmit"],
    ]
    story.append(tbl(build_rows, [1.85 * inch, 4.85 * inch]))
    story.append(Spacer(1, 10))
    story.append(
        Paragraph(
            "Key dependencies: electron 33, react 19, vite 7, tailwind 4, @assistant-ui/react, "
            "electron-store, node-pty, pdf-parse, framer-motion, zustand.",
            body,
        )
    )
    story.append(PageBreak())
    story.append(Paragraph("Appendix A. ipcMain.handle channel index", h1))
    story.append(
        Paragraph(
            "Alphabetical list of <b>invoke</b> handlers registered in desktop/main.js. "
            "Renderer events without a return value use ipcMain.on instead (for example "
            "minimize-window, maximize-window, close-window, excelor-close, excelor-subagent-tool-result).",
            body,
        )
    )
    story.append(Spacer(1, 6))
    story.append(appendix_ipc_handle_table())
    story.append(Spacer(1, 14))
    story.append(
        HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e2e8f0"), spaceBefore=6, spaceAfter=10)
    )
    story.append(
        Paragraph(
            "End of Excelor desktop technical deep dive. For full tool registry and narrative features, "
            "see EXCELOR_CAPABILITIES.md.",
            small,
        )
    )

    return story


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    title, subtitle, h1, h2, body, small, mono = make_styles()
    story = build_story(title, subtitle, h1, h2, body, small, mono)

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=LETTER,
        leftMargin=0.65 * inch,
        rightMargin=0.65 * inch,
        topMargin=0.6 * inch,
        bottomMargin=0.65 * inch,
    )
    doc.build(story, onFirstPage=add_footer, onLaterPages=add_footer)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
