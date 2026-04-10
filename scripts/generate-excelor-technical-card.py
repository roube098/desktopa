"""
One-page technical reference card for the Excelor desktop application (PDF).
Run from repo root: python scripts/generate-excelor-technical-card.py
"""
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT = REPO_ROOT / "output" / "pdf" / "Excelor-Technical-Card.pdf"


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=LETTER,
        leftMargin=0.65 * inch,
        rightMargin=0.65 * inch,
        topMargin=0.55 * inch,
        bottomMargin=0.5 * inch,
    )
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "Title",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=26,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=4,
    )
    tag = ParagraphStyle(
        "Tag",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#475569"),
        spaceAfter=14,
    )
    h2 = ParagraphStyle(
        "H2",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#1e293b"),
        spaceBefore=10,
        spaceAfter=6,
    )
    body = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=12.5,
        textColor=colors.HexColor("#334155"),
    )
    small = ParagraphStyle(
        "Small",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#64748b"),
    )
    mono = ParagraphStyle(
        "Mono",
        parent=styles["Normal"],
        fontName="Courier",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#0f172a"),
    )

    story = []

    story.append(Paragraph("Excelor", title))
    story.append(
        Paragraph(
            "Electron desktop client for an autonomous AI agent, document workspace, and integrations.",
            tag,
        )
    )
    story.append(
        HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e2e8f0"), spaceBefore=2, spaceAfter=10)
    )

    story.append(Paragraph("Product identity", h2))
    story.append(
        Paragraph(
            "Local-first AI execution environment: chat threads, OnlyOffice-backed editing, "
            "browser automation via embedded WebContentsView, plugins and skills, and multi-provider LLM settings. "
            "The UI talks to a Bun/TypeScript agent runtime over HTTP and Server-Sent Events (SSE).",
            body,
        )
    )

    story.append(Paragraph("Desktop application stack", h2))
    stack_data = [
        ["Layer", "Technologies"],
        ["Shell", "Electron 33, Node.js main process, contextBridge IPC preload"],
        ["Renderer", "React 19, Vite 7, TypeScript 5.x, Tailwind CSS 4"],
        ["UI libs", "@assistant-ui/react, Radix UI, Framer Motion, Zustand, Lucide icons"],
        ["Storage", "electron-store (providers, runtime config)"],
        ["Packaging", "electron-builder (Windows target in build script)"],
    ]
    t_stack = Table(stack_data, colWidths=[1.35 * inch, 5.45 * inch])
    t_stack.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
            ]
        )
    )
    story.append(t_stack)
    story.append(Spacer(1, 6))

    story.append(Paragraph("Architecture highlights", h2))
    bullets = [
        "<b>Dual Excelor HTTP scopes</b> (main and OnlyOffice): separate runtimes on configurable ports "
        "(defaults 27182 main, 27183 OnlyOffice bridge).",
        "<b>Document engine</b>: Docker-managed OnlyOffice Document Server; workspace under user Documents "
        "with bridge URLs for in-app iframe editing.",
        "<b>Agent loop</b>: streamed turns, tool execution, scratchpad JSONL, compaction, subagent delegation.",
        "<b>Embeds</b>: PDF text via pdf-parse for context; optional terminal (node-pty) and gateway hooks.",
    ]
    for b in bullets:
        story.append(Paragraph(f"- {b}", body))
        story.append(Spacer(1, 3))

    story.append(Paragraph("Representative HTTP surface (agent runtime)", h2))
    http_data = [
        ["Method", "Path", "Role"],
        ["POST", "/run", "Execute agent turn (SSE stream)"],
        ["GET", "/health", "Liveness"],
        ["POST", "/abort", "Cancel in-flight turn"],
        ["POST", "/editor/tool", "Editor-bound tool bridge"],
        ["POST", "/plugins/refresh", "Reload plugin registry"],
    ]
    t_http = Table(http_data, colWidths=[0.75 * inch, 1.55 * inch, 3.5 * inch])
    t_http.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("FONTNAME", (1, 1), (1, -1), "Courier"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
            ]
        )
    )
    story.append(t_http)
    story.append(Spacer(1, 8))

    story.append(Paragraph("Workspace file types (OnlyOffice / workspace)", h2))
    story.append(
        Paragraph(
            ".xlsx, .xls, .docx, .doc, .pptx, .ppt, .pdf, .csv, .md, .txt",
            mono,
        )
    )
    story.append(Spacer(1, 10))

    story.append(
        Paragraph(
            "Excelor desktop package v1.0.0 - MIT License. Card generated for technical onboarding and architecture reviews.",
            small,
        )
    )

    doc.build(story)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
