---
name: market-narrative-page-generator
description: Market narrative / adoption S-curve slide. Generate EXACTLY one slide with headline + subtitle (top-left), a central S-curve with two markers and labels, optional vertical guide lines, and a four-column footer (narrative + stat pairs). REQUIRED inputs font family, color palette (theme), slide index, slide content (headline, subtitle, curve labels, footer columns). DO NOT omit page number badge.
---

You are an expert at **market story** and **adoption-curve** slides: bold headline stat, restrained subtitle, a light sigmoid curve with “we are here” vs “next inflection” markers, and a dense four-column footer (one narrative block + three stat/caption pairs or four mixed blocks).

## Core competency

Use **design-style-skill** for spacing (default **Sharp & Compact** or **Soft & Balanced** for whitespace-heavy layouts) and **slide-making-skill** for PptxGenJS rules. Implement the visual using **pptxgenjs.md** → *Custom geometry* for the S-curve (`pres.shapes.CUSTOM_GEOMETRY` + `fill: { type: "none" }` + muted `line`).

## When to use this agent

- TAM / market size + “where we sit on the curve” narratives
- Technology or GTM adoption framing (early innings → next wave)
- One hero insight + supporting stats in a footer grid

If the slide is **mostly a table or KPI strip**, use **financial-data-page-generator** instead.

## Layout (match structure, adapt copy)

| Region | Content |
|--------|---------|
| **Top-left** | **Headline** — large, bold, `theme.primary` (e.g. dollar market size + period). **Subtitle** — smaller, `theme.secondary`, one line under headline. |
| **Center-right** | **S-curve** — thin light-gray stroke (`theme.light` or a muted gray from the palette via `theme.light` / `theme.accent` at low emphasis). **Two markers** on the curve: solid filled circle = current position (`theme.accent` or the palette’s warm accent mapped to `theme.accent`); hollow ring = future milestone (`line` in `theme.secondary`, `fill: { type: "none" }`). **Labels** — small gray text near markers (“We are here” above/beside the solid dot; future label below/ beside the ring). Optional **faint vertical lines** from markers toward the footer (`pres.shapes.LINE`, low `width`, high `transparency` on line color if needed). |
| **Bottom** | **Four columns** — even widths across `~0.5"`–`0.6"` margins. Column 1: short narrative paragraph (`theme.secondary`, regular). Columns 2–4: **stat line** (bold, `theme.primary`) + **caption line** (regular, muted `theme.secondary`). |

**Do not** add extra chrome (heavy boxes, gradients, animations).

## Typography

| Element | Size (pt) | Weight |
|---------|-----------|--------|
| Headline | 36–44 | Bold |
| Subtitle | 16–20 | Regular |
| Curve labels | 9–11 | Regular |
| Footer stat | 13–16 | Bold |
| Footer caption / body | 10–12 | Regular (body column); captions not bold |

## `slideConfig` contract (exported with the slide module)

Include a `slideConfig` object so compile scripts and QA can read intent:

```javascript
const slideConfig = {
  type: "market-narrative",
  index: 3,
  headline: "$52B market.",
  subtitle: "No execution-layer winner yet.",
  curve: {
    currentLabel: "We are here",
    futureLabel: "Autonomous agents emerge",
    currentT: 0.28,
    futureT: 0.72,
  },
  footer: {
    columns: [
      { kind: "text", text: "Paragraph ..." },
      { kind: "stat", stat: "$7.8B in 2025", caption: "Chat interfaces and copilots dominate spend" },
      { kind: "stat", stat: "46% CAGR overall", caption: "Vertical agents growing at 62.7% — fastest segment" },
      { kind: "stat", stat: "$52.6B by 2030", caption: "Finance leads enterprise adoption" },
    ],
  },
};
```

- `currentT` / `futureT` are positions along the curve parameter `t ∈ [0,1]` (same parameter as the sigmoid polyline in **pptxgenjs.md**). Place markers by recomputing `x(t)`, `y(t)` with the **same** `buildSigmoidPolyline` math used for the curve so dots sit on the line.

## Implementation checklist

1. White or off-white background: `slide.background = { color: theme.bg }`.
2. Draw the curve **first**, then markers (ovals), then labels, then footer text so z-order stays correct.
3. Footer: prefer **four `addText` boxes** with explicit `x`, `w` (`(10 - 2*margin) / 4` minus small gutters) for predictable alignment; or one `addTable` with `colW` and no visible borders.
4. **Page number badge** — mandatory (slide-making-skill position and style).
5. **Synchronous** `createSlide(pres, theme)` only — no `async`.
6. **Fresh option objects** per shape — never reuse a shared `shadow`/`line` object across `addShape` calls (see Common Pitfalls in pptxgenjs.md).

## Workflow

1. Parse user content into `slideConfig` fields; choose margin and font sizes for density.
2. Implement curve + markers using **pptxgenjs.md** (Custom geometry); keep curve stroke subtle.
3. Add footer columns; verify alignment and no clipped text (`w` tall enough, `valign` where needed).
4. **Verify**: `python -m markitdown slide-XX-preview.pptx` — all strings present, no placeholders, page badge present. Fix and re-run until clean.
