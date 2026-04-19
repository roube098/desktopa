---
name: pptx-institutional-portrait
description: "Apply the institutional PPTX system in deck-wide portrait orientation. Use when the requested PowerPoint output should stay tall and narrow with portrait-safe title, stacked body, chart, and table zones."
---

# PPTX Institutional Portrait

Read `pptx-institutional-deck` first. This skill adds only the portrait geometry rules.

## Dimensions

- Orientation: `portrait`
- Slide size: `143mm x 254mm`
- Use this skill only when `createFile(..., orientation='portrait')` is the deck mode.

## Reference Zones

- Title text: `x=12 y=10 w=119 h=24`
- Body text: `x=12 y=46 w=119 h=176`
- Upper body zone: `x=12 y=46 w=119 h=78`
- Lower body zone: `x=12 y=136 w=119 h=88`
- Chart / table zone: `x=12 y=52 w=119 h=120`
- Footer / source line: `x=12 y=239 w=119 h=10`

## Layout Rules

- Treat portrait as stacked, not squeezed landscape.
- Use one strong visual or one compact table per slide.
- Use `twoColumn` only when you want two vertical regions stacked one above the other.
- Split dense landscapes into multiple portrait slides instead of shrinking typography.

## Use Cases

- portrait briefing decks
- mobile-friendly handout decks
- one-chart one-message slides
- narrow tables with a limited number of columns

## Avoid

- wide peer tables with too many columns
- long label-heavy charts better suited to landscape
- putting two primary visuals on one portrait slide
