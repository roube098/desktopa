---
name: pptx-chart-stacked-column
description: "Build institutional stacked column charts in PPTX. Use for contribution splits, mix shifts, segmented revenue, or value-build visuals where totals are composed from distinct parts."
---

# PPTX Chart Stacked Column

Read `pptx-institutional-deck` first, then read the matching orientation skill.

## Use When

Use `stackedColumn` for:

- segmented contribution charts
- mix or composition shifts over time
- stacked value-build visuals

This is the closest skill to the segmented contribution screenshots.

## Data Shape

- `categoryNames`: periods or categories
- `series`: stacked numeric layers
- `seriesNames`: labels for each layer

Keep stacks to `2-4` series whenever possible.

## Placement

- Landscape default: `x=15 y=40 w=224 h=90`
- Portrait default: `x=12 y=52 w=119 h=120`

## Formatting Rules

- Order stacks deliberately; base layer first, top layer last.
- Use restrained contrasting blues or slates only.
- If total growth is the message, reinforce it in the slide title or callout.
- Add a `Source:` line whenever the numbers are externally sourced.

## Do Not Use

- simple category ranking without components
- too many stacked series
- cases where part-to-whole is unclear and a table would be cleaner
