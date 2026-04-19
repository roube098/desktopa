---
name: pptx-chart-donut
description: "Build institutional donut charts in PPTX. Use for simple share-of-total visuals when a center callout or headline total helps the message."
---

# PPTX Chart Donut

Read `pptx-institutional-deck` first, then read the matching orientation skill.

## Use When

Use `donut` for:

- simple share-of-total views
- composition charts that benefit from a center callout

## Data Shape

- `categoryNames`: slice labels
- `series`: one numeric series only
- `seriesNames`: one series label

## Placement

- Landscape default: `x=65 y=36 w=124 h=84`
- Portrait default: `x=22 y=60 w=99 h=99`

## Formatting Rules

- Keep slice count low.
- Use the center area for a concise headline only if it materially helps.
- Add a `Source:` line when required.

## Do Not Use

- detailed analytical breakdowns
- many slices
- cases where the center label would become decorative instead of useful
