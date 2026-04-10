# PPTX Plugin

## Quick Reference

| Task | Guide |
|------|-------|
| Read/analyze content | `python -m markitdown presentation.pptx` |
| Edit or create from template | Read `ppt-editing-skill` |
| Create from scratch | Use subagents + PptxGenJS, see below |

---

## Reading Content

```bash
# Text extraction
python -m markitdown presentation.pptx
```

---

## Editing Workflow

**Read `ppt-editing-skill` for full details.**

1. Analyze template with `markitdown`
2. Unpack → manipulate slides → edit content → clean → pack

---

## Creating from Scratch

**Use when no template or reference presentation is available.**

1. Search to understand user requirements
2. Use color-font-skill to select palette and fonts (for **investment research / equity memo** decks, use palette **#19** and read **investment-research-skill**)
3. Read ppt-orchestra-skill to design your PPT outline
4. Spawn subagents to create slide JS files (max 5 concurrent)
5. Compile all slide modules into final PPTX

### Investment research style

For IC memos, diligence summaries, comps/valuation decks, and sell-side–style reports:

- Follow **investment-research-skill** (thesis-led titles, sourced data, dense tables).
- Add **financial-data-page-generator** for KPI/comps/valuation slides and **legal-disclaimer-page-generator** when a disclaimer or safe-harbor slide is required.

### Subagent Types

- `cover-page-generator` - Cover slide
- `table-of-contents-generator` - TOC slide
- `section-divider-generator` - Section transition
- `content-page-generator` - Content slides
- `market-narrative-page-generator` - Market headline + adoption S-curve + four-column footer (TAM / “where we are on the curve”)
- `dashboard-chart-generator` - Default chart styling (capsule columns, overlapping groups, pie/doughnut, pills, grids) for **any** theme — light, dark, or brand; dark+lime is one preset
- `financial-data-page-generator` - Tables, KPI strips, charts + source (research / finance)
- `legal-disclaimer-page-generator` - Disclaimers, safe harbor, forward-looking statements
- `summary-page-generator` - Summary/CTA slide

### Output Structure

```
slides/
├── slide-01.js          # Slide modules
├── slide-02.js
├── ...
├── imgs/                # Images used in slides
└── output/              # Final artifacts
    └── presentation.pptx
```

### Example: market narrative (S-curve) slide

From repo root:

```bash
cd plugins/pptx-plugin/examples
npm install
node market-narrative-slide.example.js
```

Writes `market-narrative-slide-preview.pptx` in the same folder (requires `pptxgenjs`). Use **`market-narrative-page-generator`** for the same layout with your copy.

**Dark dashboard charts** (pie + pills + capsule bars + stepped overlapping columns):

```bash
cd plugins/pptx-plugin/examples
npm install
node dark-dashboard-charts.example.js
```

Writes `dark-dashboard-charts-preview.pptx` (two slides, **dark neon** preset). Use **`dashboard-chart-generator`** for the same geometry on **any** palette (swap `theme` / colors per agent).

### Tell Subagents

1. File naming: `slides/slide-01.js`, `slides/slide-02.js`
2. Images go in: `slides/imgs/`
3. Final PPTX goes in: `slides/output/`
4. Dimensions: 10" × 5.625" (LAYOUT_16x9)
5. Fonts: Chinese=Microsoft YaHei, English=**Inter** (install: [Google Fonts — Inter](https://fonts.google.com/specimen/Inter); if unavailable use Segoe UI)
6. Colors: 6-char hex without # (e.g. `"FF0000"`)

---

## QA & Dependencies

See **ppt-orchestra-skill** for QA process and dependencies.
