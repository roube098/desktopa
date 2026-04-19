---
name: pptx-chart-scatter
description: "Build institutional scatter charts in PPTX. Use for numeric relationships, factor relationships, or valuation versus growth style views where the relationship itself is the point."
---

# PPTX Chart Scatter

Read `pptx-institutional-deck` first, then read the matching orientation skill.

## Use When

Use `scatter` for:

- valuation versus growth charts
- factor or performance relationships
- correlation-oriented visuals

## Data Shape

- `categoryNames`: point labels or identifiers
- `series`: numeric points grouped by series
- `seriesNames`: labels for each point group

## Placement

- Landscape default: `x=15 y=40 w=224 h=90`
- Portrait default: `x=12 y=52 w=119 h=120`

## Formatting Rules

- Keep the number of series low and interpretable.
- Use direct axis-related titles in the slide title or subtitle.
- Add a `Source:` line for external data.

## Do Not Use

- ordinal time-series data
- part-to-whole composition
- dense labeled visuals that would read better as a table
