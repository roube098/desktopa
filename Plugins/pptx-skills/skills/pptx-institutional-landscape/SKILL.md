---
name: pptx-institutional-landscape
description: "Apply the institutional PPTX system in deck-wide landscape orientation. Use when the requested PowerPoint output should stay wide and finance-friendly with landscape-safe title, body, chart, and table zones."
---

# PPTX Institutional Landscape

Read `pptx-institutional-deck` first. This skill adds only the landscape geometry rules.

## Dimensions

- Orientation: `landscape`
- Slide size: `254mm x 143mm`
- Use this skill only when `createFile(..., orientation='landscape')` is the deck mode.

## Reference Zones

- Title text: `x=15 y=8 w=224 h=22`
- Body text: `x=15 y=38 w=224 h=95`
- Two-column left: `x=10 y=38 w=112 h=95`
- Two-column right: `x=132 y=38 w=112 h=95`
- Chart zone: `x=15 y=40 w=224 h=90`
- Footer / source line: `x=15 y=130 w=224 h=10`

## Layout Rules

- Use `titleContent` for most narrative and single-visual slides.
- Use `twoColumn` or `comparison` when the slide truly benefits from side-by-side structure.
- Keep generous horizontal width for tables and long time-series charts.
- Use wide charts before shrinking text.

## Use Cases

- ranked category comparisons
- peer tables with several columns
- time-series charts with many periods
- summary slides that need two balanced content regions

## Avoid

- forcing a portrait-like stacked layout into wide slides
- placing two dense tables side by side
- leaving large empty areas just because the canvas is wide
