---
name: slide-making-skill
description: "Implement single-slide PowerPoint pages with PptxGenJS. Use when writing or fixing slide JS files: dimensions, positioning, text/image/chart APIs, styling rules, and export expectations for native .pptx output. For investment research / financial table slides, follow investment-research-skill while keeping the standard theme object keys."
---

# PptxGenJS Slide Making Skill

This skill teaches how to generate native .pptx slides using PptxGenJS (JavaScript).

## PptxGenJS Reference

**Read [pptxgenjs.md](pptxgenjs.md) for the complete PptxGenJS API reference**, including:
- Setup & basic structure
- Text & formatting
- Lists & bullets
- Shapes & shadows (including **CUSTOM_GEOMETRY** for S-curves / adoption curves)
- Images & icons
- Slide backgrounds
- Tables & charts

For **market headline + S-curve + four-column footer** slides, spawn or follow **`market-narrative-page-generator`** (see `agents/market-narrative-page-generator.md`) in addition to this skill.

For **any slide that includes charts** (pie, doughnut, capsule columns, overlapping rounded bars, tag pills — on **light, dark, or brand** backgrounds), follow **`dashboard-chart-generator`** and **pptxgenjs.md** → *Dashboard chart style*.

---

## Font Rules

### Font Family Standards

| Language | Default | Alternatives |
|----------|---------|--------------|
| **Chinese** | Microsoft YaHei | — |
| **English** | **Inter** | Segoe UI, Open Sans, Source Sans 3 |

```javascript
fontFace: "Microsoft YaHei"  // Chinese text
fontFace: "Inter"            // English — modern UI sans (install: https://fonts.google.com/specimen/Inter)
```

**Inter** is the default: geometric, readable, matches product/marketing UI typography. If Inter is not installed, PowerPoint may substitute — use **Segoe UI** (Windows) as `fontFace` when you must rely on preinstalled fonts only. Header/body can still differ (e.g., semibold Inter titles + regular Inter body).

**Tagline / emphasis line:** body in cool charcoal (`363636`–`3D4556`), key word in **bold** + black (`000000`) via rich text:

```javascript
slide.addText(
  [
    { text: "Excelor agents ", options: { fontFace: "Inter", fontSize: 22, color: "3D4556" } },
    { text: "execute", options: { fontFace: "Inter", fontSize: 22, bold: true, color: "000000" } },
    { text: " —", options: { fontFace: "Inter", fontSize: 22, color: "3D4556", breakLine: true } },
    { text: "end to end, no human in the loop.", options: { fontFace: "Inter", fontSize: 22, color: "3D4556" } },
  ],
  { x: 0.5, y: 1, w: 9, h: 1.2, margin: 0 }
);
```

### No Bold for Body Text

**Plain body text and caption/legend text must NOT use bold.**

- Body paragraphs, descriptions → normal weight
- Captions, legends, footnotes → normal weight
- Reserve bold for titles and headings only

```javascript
// ✅ Correct
slide.addText("Main Title", { bold: true, fontSize: 36, fontFace: "Inter" });
slide.addText("Body text here.", { bold: false, fontSize: 14, fontFace: "Inter" });

// ❌ Wrong
slide.addText("Body text here.", { bold: true, fontSize: 14 });
```

---

## Color Palette Rules (MANDATORY)

### Strict Palette Adherence

**Use ONLY the provided color palette. Do NOT create or modify colors.**

- All colors must come from the user-provided palette
- Do NOT use colors outside the palette
- Do NOT modify palette colors (brightness, saturation, mixing)
- **Only exception**: Add transparency using the `transparency` property (0-100)

```javascript
// ✅ Correct: Using palette colors
slide.addShape(pres.shapes.RECTANGLE, { fill: { color: theme.primary } });
slide.addText("Title", { color: theme.accent });

// ❌ Wrong: Colors outside palette
slide.addShape(pres.shapes.RECTANGLE, { fill: { color: "1a1a2e" } });
```

### No Gradients

**Gradients are prohibited. Use solid colors only.**

```javascript
// ✅ Correct: Solid colors
slide.background = { color: theme.bg };

// ✅ Correct: Solid + transparency for overlay
slide.addShape(pres.shapes.RECTANGLE, { fill: { color: theme.accent, transparency: 50 } });
```

### No Animations

**Animations and transitions are prohibited.** All slides must be static.

---

## Page Number Badge (REQUIRED)

All slides **except Cover Page** MUST include a page number badge in the bottom-right corner.

- **Position**: x: 9.3", y: 5.1"
- Show current number only (e.g. `3` or `03`), NOT "3/12"
- Use palette colors, keep subtle

### Circle Badge (Default)

```javascript
slide.addShape(pres.shapes.OVAL, {
  x: 9.3, y: 5.1, w: 0.4, h: 0.4,
  fill: { color: theme.accent }
});
slide.addText("3", {
  x: 9.3, y: 5.1, w: 0.4, h: 0.4,
  fontSize: 12, fontFace: "Inter",
  color: "FFFFFF", bold: true,
  align: "center", valign: "middle"
});
```

### Pill Badge

```javascript
slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
  x: 9.1, y: 5.15, w: 0.6, h: 0.35,
  fill: { color: theme.accent },
  rectRadius: 0.15
});
slide.addText("03", {
  x: 9.1, y: 5.15, w: 0.6, h: 0.35,
  fontSize: 11, fontFace: "Inter",
  color: "FFFFFF", bold: true,
  align: "center", valign: "middle"
});
```

---

## Theme Object Contract (MANDATORY)

The compile script passes a theme object with these **exact keys**:

| Key | Purpose | Example |
|-----|---------|---------|
| `theme.primary` | Darkest color, titles | `"22223b"` |
| `theme.secondary` | Dark accent, body text | `"4a4e69"` |
| `theme.accent` | Mid-tone accent | `"9a8c98"` |
| `theme.light` | Light accent | `"c9ada7"` |
| `theme.bg` | Background color | `"f2e9e4"` |

**NEVER use other key names** like `background`, `text`, `muted`, `darkest`, `lightest`.

For **investment research** decks (tables, comps, KPIs), see **investment-research-skill** — still use these five keys; map table headers to `theme.light`, sources to `theme.accent`.

---

## Subagent Output Format

Each subagent outputs a **complete, runnable JS file**:

```javascript
// slide-01.js
const pptxgen = require("pptxgenjs");

const slideConfig = {
  type: 'cover',
  index: 1,
  title: 'Presentation Title'
};

// ⚠️ MUST be synchronous (not async)
function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };

  slide.addText(slideConfig.title, {
    x: 0.5, y: 2, w: 9, h: 1.2,
    fontSize: 48, fontFace: "Inter",  // English text uses Inter
    color: theme.primary, bold: true, align: "center"
  });

  return slide;
}

// Standalone preview - use slide-specific filename (slide-XX-preview.pptx)
if (require.main === module) {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9';
  const theme = {
    primary: "22223b",
    secondary: "4a4e69",
    accent: "9a8c98",
    light: "c9ada7",
    bg: "f2e9e4"
  };
  createSlide(pres, theme);
  // Replace XX with actual slide index (01, 02, etc.) to avoid conflicts
  pres.writeFile({ fileName: "slide-01-preview.pptx" });
}

module.exports = { createSlide, slideConfig };
```

---

## Critical Pitfalls

### NEVER use async/await in createSlide()

```javascript
// ❌ WRONG - compile.js won't await
async function createSlide(pres, theme) { ... }

// ✅ CORRECT
function createSlide(pres, theme) { ... }
```

### NEVER use "#" with hex colors

```javascript
color: "FF0000"      // ✅ CORRECT
color: "#FF0000"     // ❌ CORRUPTS FILE
```

### NEVER encode opacity in hex strings

```javascript
shadow: { color: "00000020" }              // ❌ CORRUPTS FILE
shadow: { color: "000000", opacity: 0.12 } // ✅ CORRECT
```

### Prevent text wrapping in titles

```javascript
// ✅ Use fit:'shrink' for long titles
slide.addText("Long Title Here", {
  x: 0.5, y: 2, w: 9, h: 1,
  fontSize: 48, fit: "shrink"
});
```

---

## Quick Reference

- **Dimensions**: 10" × 5.625" (LAYOUT_16x9)
- **Colors**: 6-char hex without # (e.g., `"FF0000"`)
- **English font**: Inter (default); Segoe UI / Open Sans if Inter unavailable
- **Chinese font**: Microsoft YaHei
- **Page badge position**: x: 9.3", y: 5.1"

---

## QA (Required)

**Assume there are problems. Your job is to find them.**

Your first render is almost never correct. Approach QA as a bug hunt, not a confirmation step. If you found zero issues on first inspection, you weren't looking hard enough.

### Content QA

```bash
python -m markitdown slide-XX-preview.pptx
```

Check for missing content, typos, wrong order.

**Check for leftover placeholder text:**

```bash
python -m markitdown slide-XX-preview.pptx | grep -iE "xxxx|lorem|ipsum|placeholder"
```

If grep returns results, fix them before declaring success.

### Verification Loop

1. Generate slide → Extract text with `python -m markitdown slide-XX-preview.pptx` → Review content
2. **List issues found** (if none found, look again more critically)
3. Fix issues
4. **Re-verify** — one fix often creates another problem
5. Repeat until verification reveals no new issues

**Do not declare success until you've completed at least one fix-and-verify cycle.**

---
