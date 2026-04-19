---
name: pptx-chart-column
description: "Build institutional vertical column charts in PPTX. Use for ranked category comparisons such as sector performance, peer ranking, or scorecard-style bars where category order matters."
---

# PPTX Chart Column

Read `pptx-institutional-deck` first, then read the matching orientation skill.

## Use When

Use `column` for:

- ranked sector-performance charts
- peer ranking visuals
- quarter or category comparisons with short labels

## Data Shape

- `categoryNames`: ordered categories on the x-axis
- `series`: one or two numeric series
- `seriesNames`: labels aligned to the series rows

Keep ranking charts pre-sorted before building the visual.

## Placement

- Landscape default: `x=15 y=40 w=224 h=90`
- Portrait default: `x=12 y=52 w=119 h=120`

## Formatting Rules

- Prefer one primary series.
- Show value labels when ranking is the message.
- Keep labels short; rotate or abbreviate before switching fonts or shrinking text.
- Add a `Source:` line below the chart.

## Do Not Use

- long labels that read better horizontally
- contribution splits that need `stackedColumn`
- time series that need `line`
