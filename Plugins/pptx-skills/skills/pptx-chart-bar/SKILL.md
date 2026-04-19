---
name: pptx-chart-bar
description: "Build institutional horizontal bar charts in PPTX. Use for category comparisons with long labels, exposure names, or survey-style responses that need readable left-side labeling."
---

# PPTX Chart Bar

Read `pptx-institutional-deck` first, then read the matching orientation skill.

## Use When

Use `bar` for:

- long-label category comparisons
- exposure, sleeve, or factor comparisons
- lists where readability of labels matters more than strict ranking optics

## Data Shape

- `categoryNames`: left-side labels
- `series`: one or two numeric series
- `seriesNames`: labels aligned to the series rows

## Placement

- Landscape default: `x=15 y=40 w=224 h=90`
- Portrait default: `x=12 y=52 w=119 h=120`

## Formatting Rules

- Keep labels verbatim when they are business-critical.
- Prefer one primary series and one comparator at most.
- Keep the title conclusion-led.
- Add a `Source:` line for external or market data.

## Do Not Use

- short labels that look cleaner as `column`
- time series
- share-of-total visuals
