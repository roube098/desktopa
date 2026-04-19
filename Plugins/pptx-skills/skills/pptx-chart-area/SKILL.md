---
name: pptx-chart-area
description: "Build institutional area charts in PPTX. Use for trend visuals where continuity matters and magnitude or coverage should feel heavier than a plain line chart."
---

# PPTX Chart Area

Read `pptx-institutional-deck` first, then read the matching orientation skill.

## Use When

Use `area` for:

- trend visuals where cumulative magnitude matters
- time series that benefit from more visual weight than a line
- one or two series only

## Data Shape

- `categoryNames`: ordered periods
- `series`: one or two numeric series
- `seriesNames`: aligned series labels

## Placement

- Landscape default: `x=15 y=40 w=224 h=90`
- Portrait default: `x=12 y=52 w=119 h=120`

## Formatting Rules

- Keep fills muted and institutional.
- Use one primary area whenever possible.
- Avoid obscuring comparison logic with too many overlaps.
- Add a `Source:` line.

## Do Not Use

- precise multi-series comparisons better shown as lines
- share-of-total views
- categorical ranking
