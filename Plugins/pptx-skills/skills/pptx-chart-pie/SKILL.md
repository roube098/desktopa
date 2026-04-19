---
name: pptx-chart-pie
description: "Build institutional pie charts in PPTX. Use only for simple share-of-total views with a small number of categories and an obvious composition message."
---

# PPTX Chart Pie

Read `pptx-institutional-deck` first, then read the matching orientation skill.

## Use When

Use `pie` only for:

- simple share-of-total views
- `3-6` categories with clear composition logic

## Data Shape

- `categoryNames`: slice labels
- `series`: one numeric series only
- `seriesNames`: one series label

## Placement

- Landscape default: `x=65 y=36 w=124 h=84`
- Portrait default: `x=22 y=60 w=99 h=99`

## Formatting Rules

- Keep slice count low.
- Use restrained labels and a direct title.
- Add a `Source:` line when needed.

## Do Not Use

- more than six slices
- ranked comparisons
- cases where bars or a table communicate better
