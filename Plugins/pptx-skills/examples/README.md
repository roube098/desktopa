# Examples

This folder keeps rebuildable references for the institutional PPTX plugin.

## Orientation Examples

- `institutional-landscape.example.js`
- `institutional-portrait.example.js`

## Chart And Visual Examples

- `chart-column.example.js`
- `chart-bar.example.js`
- `chart-stacked-column.example.js`
- `chart-line.example.js`
- `chart-area.example.js`
- `chart-pie.example.js`
- `chart-donut.example.js`
- `chart-scatter.example.js`
- `visual-table.example.js`
- `visual-growth-story.example.js`

## Shared Helper

- `example-lib.js`: common Calibri theme, orientation layouts, table helper, and output helper

## Install And Run

```bash
npm install
npm run examples:smoke
```

That smoke run builds:

- `institutional-landscape-preview.pptx`
- `institutional-portrait-preview.pptx`
- `chart-column-preview.pptx`
- `chart-line-preview.pptx`
- `visual-table-preview.pptx`
- `chart-stacked-column-preview.pptx`
- `visual-growth-story-preview.pptx`

Generated PowerPoint files and `node_modules/` are ignored on purpose.
