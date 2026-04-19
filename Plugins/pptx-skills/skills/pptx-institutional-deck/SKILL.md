---
name: pptx-institutional-deck
description: "Create PowerPoint decks from scratch in Excelor using one fixed institutional design system: Calibri-only typography, white/navy/slate theme, sharp compact layout, deck-wide portrait or landscape orientation, and explicit chart-routing rules."
---

# PPTX Institutional Deck

This is the canonical PPTX skill. Read it first for every create-from-scratch deck. Then read the matching orientation skill and any chart or visual skill needed for specific slides.

## Locked Design System

Use this exact system on every slide:

```javascript
const theme = {
  primary: "0c2340",
  secondary: "3d4f66",
  accent: "64748b",
  light: "e8edf0",
  bg: "ffffff",
};
```

- Font: `Calibri` only
- Canvas: `ffffff` only
- Geometry: sharp, compact, finance-friendly, data-first
- Tone: institutional, analytical, restrained

Hard prohibitions:

- no gradients
- no alternate palettes
- no alternate font stacks
- no rounded or pill-heavy cards
- no decorative title underlines
- no marketing-deck styling drift

## Orientation Model

Deck orientation is set once with `createFile(format='pptx', orientation=...)`.

- `landscape`: read `pptx-institutional-landscape`
- `portrait`: read `pptx-institutional-portrait`

Do not mix orientations inside one deck session.

## Typography

Use `Calibri` for titles, body text, tables, captions, page badges, and chart labels.

- Cover title: `28-36 pt`
- Slide title: `24-32 pt`
- Body text: `14-16 pt`
- Table header: `11-12 pt`
- Table body: `10-11 pt`
- Source / note: `9-10 pt`

Never push body text below `14 pt` just to preserve slide count.

## Slide Taxonomy

Use repeatable institutional slide types:

1. Cover
2. Section divider
3. Narrative / thesis slide
4. Data slide
5. Summary / recommendation
6. Disclaimer when required

Variation should come from content type, not from changing the design system.

## Routing Rules

After reading this skill, read the matching specialist skill for the slide type:

- ranked category comparison: `pptx-chart-column`
- long-label comparison: `pptx-chart-bar`
- segmented contribution view: `pptx-chart-stacked-column`
- time series: `pptx-chart-line`
- trend plus magnitude: `pptx-chart-area`
- simple share-of-total: `pptx-chart-pie` or `pptx-chart-donut`
- numeric relationship: `pptx-chart-scatter`
- matrix or summary table: `pptx-visual-table`
- growth narrative with arrows or callouts: `pptx-visual-growth-story`

## Create-From-Scratch Workflow In Excelor

1. Define audience, purpose, and required orientation.
2. Call `createFile(format='pptx', orientation='landscape'|'portrait')`.
3. Read the matching orientation skill.
4. Outline one clear takeaway per slide.
5. Add slides incrementally with `addSlide`.
6. Build each slide with `setSlideText`, `formatSlideText`, `addShape`, `addChart`, and `insertImage`.
7. Apply the correct chart or visual skill when a slide needs it.
8. Run `verifySlides` before delivery.

If the task is editing an existing deck, switch to `pptx-institutional-edit`.

## Core Content Rules

- Keep titles conclusion-first when possible.
- Keep body copy left-aligned unless the slide is a cover or section divider.
- Every quantitative slide needs a `Source:` line.
- Every market or valuation data point needs an as-of date.
- Prefer more slides over cramming dense paragraphs into one frame.

## QA Checklist

Before delivery, confirm:

- every slide uses `Calibri`
- every slide uses only the fixed theme tokens
- the deck orientation matches the requested output
- quantitative slides include `Source:` and units
- the correct chart type was chosen for each visual
- no slide contains off-theme colors, gradients, or rounded marketing chrome
- `verifySlides` passes
