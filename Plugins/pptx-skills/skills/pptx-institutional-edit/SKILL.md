---
name: pptx-institutional-edit
description: "Edit existing PowerPoint files or templates in Excelor while normalizing them to the fixed institutional design system, preserving deck-wide portrait or landscape orientation, and routing each visual to the correct chart or table skill."
---

# PPTX Institutional Edit

Read `pptx-institutional-deck` first. Then read the orientation skill that matches the source deck and any chart or visual skill required for the slides you touch.

## Goal

Edit an existing `.pptx` or template while converging the output to the institutional system:

- `Calibri` only
- `primary`: `0c2340`
- `secondary`: `3d4f66`
- `accent`: `64748b`
- `light`: `e8edf0`
- `bg`: `ffffff`

Do not preserve bad styling just because it exists in the source file.

## Edit Workflow In Excelor

1. Read the source deck with `extractPresentationText`.
2. Determine the deck orientation from the source geometry and use the matching orientation skill.
3. Map which slides to keep, duplicate, delete, reorder, or rebuild.
4. Use `preparePresentationTemplate` when template-package operations are required.
5. Complete structural operations first:
   `duplicatePresentationSlide`, `deletePresentationSlides`, `reorderPresentationSlides`.
6. Update content and visuals with slide-level tools.
7. Route charts and tables through the specialist skills instead of generic styling.
8. Run `cleanPresentationPackage`, `packPresentationTemplate`, and `verifySlides`.

## Structural Rules

- Finish duplication, deletion, and reorder work before deep content edits.
- Preserve the existing deck orientation unless the user explicitly asks for a rebuild in the other orientation.
- Rebuild a slide instead of force-fitting a bad template layout into the institutional system.
- Remove unused placeholders, obsolete icons, and decorative leftovers.

## Normalization Rules

Convert conflicting template choices to the institutional system:

- replace mixed fonts with `Calibri`
- change tinted or off-white canvases to `ffffff`
- convert decorative accents to the fixed navy/slate tokens
- remove gradients, glow effects, shadows, pill buttons, and rounded marketing cards
- replace ornamental section chrome with thin rules, spacing, or compact muted fills

## Visual Routing Rules

- ranked category chart: `pptx-chart-column`
- long-label comparison: `pptx-chart-bar`
- contribution split: `pptx-chart-stacked-column`
- time series: `pptx-chart-line`
- trend plus magnitude: `pptx-chart-area`
- share-of-total: `pptx-chart-pie` or `pptx-chart-donut`
- numeric relationship: `pptx-chart-scatter`
- matrix or summary table: `pptx-visual-table`
- growth narrative visual: `pptx-visual-growth-story`

## QA Checklist

Before delivery, confirm:

- the deck still uses one orientation throughout
- the deck uses only `Calibri`
- every slide background is `ffffff`
- colors are limited to the fixed institutional theme
- obsolete template elements are removed
- slide order matches the intended narrative
- `verifySlides` passes and the packaged output opens cleanly
