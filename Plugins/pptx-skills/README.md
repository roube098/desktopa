# pptx-skills

Institutional PowerPoint workflows for Excelor with one locked design system and an orientation-aware PPTX runtime.

## Design System

Every public skill in this plugin uses the same visual rules:

- Font: `Calibri` only
- Theme:
  - `primary`: `0c2340`
  - `secondary`: `3d4f66`
  - `accent`: `64748b`
  - `light`: `e8edf0`
  - `bg`: `ffffff`
- Canvas: pure white only
- Layout: sharp, compact, finance-friendly
- Domain bias: equity research, IC, diligence, valuation, and institutional business decks

Hard prohibitions:

- no gradients
- no alternate palettes
- no alternate font stacks
- no rounded or pill-heavy card systems
- no decorative title underlines
- no marketing-deck styling drift

## Runtime Support

The underlying Excelor PPTX runtime now supports:

- deck-wide `landscape` and `portrait` orientation through `createFile(format='pptx', orientation=...)`
- session-specific geometry verification instead of fixed wide-only bounds
- explicit editable chart types:
  - `column`
  - `bar`
  - `stackedColumn`
  - `line`
  - `area`
  - `pie`
  - `donut`
  - `scatter`

## Public Skills

### Core

- `pptx-institutional-deck`
- `pptx-institutional-edit`
- `pptx-institutional-research`

### Orientation

- `pptx-institutional-landscape`
- `pptx-institutional-portrait`

### Chart And Visual Skills

- `pptx-chart-column`
- `pptx-chart-bar`
- `pptx-chart-stacked-column`
- `pptx-chart-line`
- `pptx-chart-area`
- `pptx-chart-pie`
- `pptx-chart-donut`
- `pptx-chart-scatter`
- `pptx-visual-table`
- `pptx-visual-growth-story`

## Usage Model

Use the skills in this order:

1. Read `pptx-institutional-deck`.
2. Read the orientation skill that matches the requested deck.
3. Read the chart or visual skill that matches the slide type.
4. If the deck is research-specific, also read `pptx-institutional-research`.
5. If the task is editing an existing deck, switch to `pptx-institutional-edit`.

## Excelor Tool Mapping

Create-from-scratch workflows:

- `createFile`
- `addSlide`
- `setSlideText`
- `formatSlideText`
- `addShape`
- `addChart`
- `insertImage`
- `verifySlides`
- `compilePresentationSlides`

Edit-existing workflows:

- `extractPresentationText`
- `preparePresentationTemplate`
- `duplicatePresentationSlide`
- `deletePresentationSlides`
- `reorderPresentationSlides`
- `cleanPresentationPackage`
- `packPresentationTemplate`
- `verifySlides`

## Examples

See [examples/README.md](C:/Users/roube/Desktop/codex%20powered%20excelor/excelor/Plugins/pptx-skills/examples/README.md) for rebuildable references:

- orientation examples:
  - `institutional-landscape.example.js`
  - `institutional-portrait.example.js`
- chart examples:
  - `chart-column.example.js`
  - `chart-bar.example.js`
  - `chart-stacked-column.example.js`
  - `chart-line.example.js`
  - `chart-area.example.js`
  - `chart-pie.example.js`
  - `chart-donut.example.js`
  - `chart-scatter.example.js`
- visual examples:
  - `visual-table.example.js`
  - `visual-growth-story.example.js`

Generated `.pptx` files and vendored dependencies remain excluded from the plugin.
