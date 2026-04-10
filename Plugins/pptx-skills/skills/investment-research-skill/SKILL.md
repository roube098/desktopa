---
name: investment-research-skill
description: >
  Build equity research / investment memo style PowerPoint decks: institutional tone, dense tables,
  sourced data, KPI callouts, thesis-led structure, and compliance-friendly disclaimer slides.
  Use when users ask for investment research, equity research, pitch book style, IC memo decks,
  PE/VC diligence summaries, or sell-side style presentations.
  Triggers: investment research, equity research, pitch book, IC memo, diligence deck, sell-side,
  comps table, valuation deck, financial model summary, institutional investor.
---

# Investment research style — PPTX

Use with **ppt-orchestra-skill**, **design-style-skill** (prefer **Sharp & Compact**), **color-font-skill** (palette **Investment research & equity memo**), and **slide-making-skill**. Subagents: standard five plus **financial-data-page-generator** and **legal-disclaimer-page-generator** when the outline needs them.

---

## What “investment research” looks like

| Dimension | Guidance |
|-----------|----------|
| **Tone** | Analytical, concise, third person; avoid marketing superlatives unless quoted |
| **Density** | Higher information density than marketing decks; tables and numbers are first-class |
| **Hierarchy** | One clear takeaway per slide when possible; title = conclusion, body = support |
| **Evidence** | Every quantitative claim should have a **source line** (company filings, Bloomberg, broker, internal) |
| **Visuals** | Restrained palette (navy/charcoal + off-white); **no** decorative title underlines; charts are simple (bars, lines) with labeled axes |
| **Structure** | Thesis early; risks and valuation explicit; appendix for detail |

---

## Recommended deck outline (adapt to topic)

Order is a guide, not a rigid template.

1. **Cover** — Asset / company / theme name; “Investment research” or report type; date; author / firm (optional).
2. **Disclaimer or important notice** (if required) — Short; use **legal-disclaimer-page-generator**.
3. **Executive summary** — 3–5 bullets: thesis, key metrics, valuation view, top risks, catalysts.
4. **Investment thesis** — 3–4 pillars (bullets or numbered), each tied to a measurable point where possible.
5. **Company / asset overview** — What it is, scale, geography, ownership; one schematic or map if helpful.
6. **Market / industry** — TAM/s growth, drivers; **sourced** figures.
7. **Business model & revenue** — Segments, pricing, unit economics if relevant.
8. **Financial performance** — Revenue, margins, FCF, leverage; **table + sparkline or small chart**; period labels clear.
9. **Peers / comps** — Multiples table (EV/EBITDA, P/E, etc.) with **as-of date** and methodology note.
10. **Valuation** — Range or scenario table; assumptions in footnote-sized text.
11. **Risks** — Regulatory, competitive, execution, balance sheet, macro; severity optional.
12. **Catalysts & timeline** — Events, reporting dates, milestones.
13. **Summary / recommendation** — Recap thesis vs risks; optional **next steps** for internal decks.
14. **Appendix** — Detailed tables, methodology, full definitions.

---

## Slide-type mapping

| Need | Page type | Subagent / generator |
|------|-----------|----------------------|
| Opening | Cover | `cover-page-generator` (institutional layout) |
| Legal / compliance | Content or dedicated | `legal-disclaimer-page-generator` |
| Section break | Section divider | `section-divider-generator` |
| Bullets, narrative | Content | `content-page-generator` (text / mixed) |
| Tables, KPIs, charts | Content | `financial-data-page-generator` |
| Closing bullets | Summary | `summary-page-generator` |

---

## Typography (institutional)

| Element | Size (pt) | Weight / notes |
|---------|-------------|----------------|
| Slide title (conclusion-style) | 28–36 | Semibold; often sentence case |
| Section label (optional kicker above title) | 11–12 | All caps or small caps, muted hex |
| Body / bullets | 13–15 | Regular; **left-aligned** |
| Table header | 11–12 | Bold on tinted row |
| Table body | 10–11 | Monospace optional for alignment (`Consolas` / `Courier New`) |
| Source / footnote | 9–11 | Muted color; “Source: …” |
| Data labels on charts | 10–12 | Never smaller than footnotes |

**Font pairing (English):** For standard plugin decks, use **Inter** (slide-making-skill). For traditional institutional “bank deck” memos: Cambria or Georgia (titles) + Calibri (body) **or** Calibri throughout. Avoid display fonts and heavy italics except for defined terms.

---

## Color and layout tokens

Use **Sharp & Compact** spacing from design-style-skill.

- **Page margin:** 0.35"–0.45" (tighter than marketing decks is OK).
- **Title block:** Top band or top-left; optional **thin** rule (0.25pt–0.5pt) in muted gray **below** title only if it separates from body — not a thick “AI” accent line.
- **Tables:** Header row fill `E8E8E8` or `F2F2F2`; zebra optional `FAFAFA`; gridlines `D0D0D0`.
- **Negative / downside:** Burgundy text `8B1538` or dark red — use sparingly.
- **Positive / upside:** Dark green `1B5E20` or muted teal — sparingly.

---

## Content rules

1. **Title = takeaway** — e.g. “Margins expanded 120 bps YoY; drivers are mix and cost program” not “Financial results”.
2. **Numbers** — Units and currency explicit ($m, €, %); YoY / QoQ / CAGR labeled; **as-of** dates on market data.
3. **Sources** — Minimum one line per data-heavy slide: `Source: Company 20-F FY24; Bloomberg as of 2026-03-15`.
4. **Risks** — Concrete (e.g. “Customer concentration: top-3 = 62% revenue”) not generic “competition”.
5. **Valuation** — State methodology (comps, DCF, SOTP) in one line; key assumptions in appendix if long.
6. **No filler imagery** — Prefer charts, tables, simple diagrams over stock photos unless truly additive.

---

## Theme keys (match slide-making-skill)

Use the **same five keys** as every other deck (`primary`, `secondary`, `accent`, `light`, `bg`) so `compile.js` stays compatible. Example for palette #19:

```javascript
const theme = {
  primary: "1a2332",   // titles, table text
  secondary: "2c3e50", // emphasis body
  accent: "5c6b7a",    // muted text, sources, page badge fill
  light: "e8eaed",     // table header row, subtle fills
  bg: "ffffff",        // slide background
};
```

Map positive/negative emphasis to **fixed hex inside the slide module** only when needed (`1e5f3f`, `8b1538`) — document them in comments as exceptions to the palette.

## PptxGenJS patterns (reference)

**KPI row (three metrics):**

```javascript
// Three equal columns with large number + label; source line at bottom
const metrics = [
  { v: "$1.2b", l: "LTM revenue" },
  { v: "18%", l: "EBITDA margin" },
  { v: "2.1x", l: "Net leverage" },
];
```

**Table slide:** Use `addTable` with `colW` for fixed column widths; `fontSize` 10–11; `align` right for numeric columns; header fill `theme.light`.

**Disclaimer slide:** Smaller font (9–10pt), left-aligned, full-width text box with 0.45" margins; no bullet decoration.

---

## QA checklist (investment research)

- [ ] Every table has column headers and units in header or first row
- [ ] Market / multiple data has as-of date
- [ ] No orphan source lines (at least one per quantitative slide)
- [ ] Titles read as conclusions where appropriate
- [ ] Disclaimer text matches required language if user provided it
- [ ] `python -m markitdown output/presentation.pptx` — no placeholder text

---

## Related skills

- **financial-data-page-generator** — Dense tables, KPI strips, chart + takeaway + source
- **legal-disclaimer-page-generator** — Safe harbor, forward-looking statements, research disclaimers
- **color-font-skill** — Palette row **Investment research & equity memo**
