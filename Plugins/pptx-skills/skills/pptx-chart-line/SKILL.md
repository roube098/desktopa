---
name: pptx-chart-line
description: "Build institutional line charts in PPTX. Use for time series such as leverage spreads, market trends, price history, or indexed performance where continuity over time matters."
---

# PPTX Chart Line

Read `pptx-institutional-deck` first, then read the matching orientation skill.

## Use When

Use `line` for:

- time-series trend charts
- spreads, z-scores, or indexed performance
- quarterly or monthly history

This is the closest skill to the time-series screenshot family.

## Data Shape

- `categoryNames`: ordered time labels
- `series`: one or two numeric series
- `seriesNames`: aligned series labels

## Placement

- Landscape default: `x=15 y=40 w=224 h=90`
- Portrait default: `x=12 y=52 w=119 h=120`

## Formatting Rules

- Prefer one primary line and one comparator at most.
- If zero or parity is analytically meaningful, mention it in the title or note.
- Keep date labels readable; prune intervals instead of shrinking type too far.
- Add a `Source:` line.

## Do Not Use

- unordered categories
- wide categorical comparisons
- more series than the slide can explain cleanly
