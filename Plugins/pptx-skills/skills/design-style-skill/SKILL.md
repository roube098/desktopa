---
name: design-style-skill
description: >
  Select a consistent visual design system for PPT slides using radius/spacing style recipes.
  Use when users ask for overall style direction or component styling consistency.
  For investment research / equity memo decks, pair Sharp & Compact with investment-research-skill.
  Includes Sharp/Soft/Rounded/Pill recipes, component mappings, typography/spacing rules, and mixing guidance.
  Triggers: style, radius, spacing, corner radius, PPT style, visual style, design style, component style.
---

# Style Recipes — PPT Visual Design System

The same design system can read as four distinct styles by tuning corner radius (`rectRadius`) and spacing. Pick the recipe that fits the scenario.

> **Units**: PptxGenJS uses inches. Slide size is 10" × 5.625" (LAYOUT_16x9).

## Style overview

| Style | Corner radius range | Spacing range | Best for |
|---|---|---|---|
| **Sharp & Compact** | 0 ~ 0.05" | Tight | Data-heavy decks, tables, professional reports |
| **Soft & Balanced** | 0.08" ~ 0.12" | Moderate | Corporate updates, business decks, general-purpose PPT |
| **Rounded & Spacious** | 0.15" ~ 0.25" | Generous | Product marketing, creative showcases |
| **Pill & Airy** | 0.3" ~ 0.5" | Open | Brand decks, launches, premium presentations |

---

## Sharp & Compact

**Look**: Square, high information density, serious and professional.

### Token recipe

| Category | Value (in.) | Notes |
|---|---|---|
| Radius — small | 0" | Fully square |
| Radius — medium | 0.03" | Slight rounding |
| Radius — large | 0.05" | Small radius |
| Inner padding | 0.1" ~ 0.15" | Tight |
| Gap between elements | 0.1" ~ 0.2" | Tight |
| Page margin | 0.3" | Narrower |
| Block spacing | 0.25" ~ 0.35" | Tight |

---

## Soft & Balanced

**Look**: Moderate radius, comfortable whitespace, professional yet approachable.

### Token recipe

| Category | Value (in.) | Notes |
|---|---|---|
| Radius — small | 0.05" | Small radius |
| Radius — medium | 0.08" | Medium radius |
| Radius — large | 0.12" | Larger radius |
| Inner padding | 0.15" ~ 0.2" | Moderate |
| Gap between elements | 0.15" ~ 0.25" | Moderate |
| Page margin | 0.4" | Standard |
| Block spacing | 0.35" ~ 0.5" | Moderate |

---

## Rounded & Spacious

**Look**: Large radius, plenty of air, friendly and modern.

### Token recipe

| Category | Value (in.) | Notes |
|---|---|---|
| Radius — small | 0.1" | Medium-large |
| Radius — medium | 0.15" | Large |
| Radius — large | 0.25" | Very large |
| Inner padding | 0.2" ~ 0.3" | Generous |
| Gap between elements | 0.25" ~ 0.4" | Generous |
| Page margin | 0.5" | Wider |
| Block spacing | 0.5" ~ 0.7" | Generous |

---

## Pill & Airy

**Look**: Pill shapes, lots of whitespace, light and brand-forward.

### Token recipe

| Category | Value (in.) | Notes |
|---|---|---|
| Radius — small | 0.2" | Large |
| Radius — medium | 0.3" | Pill-like |
| Radius — large | 0.5" | Full pill |
| Inner padding | 0.25" ~ 0.4" | Open |
| Gap between elements | 0.3" ~ 0.5" | Open |
| Page margin | 0.6" | Wide |
| Block spacing | 0.6" ~ 0.9" | Open |

---

# Component style map

| Component | Sharp | Soft | Rounded | Pill |
|---|---|---|---|---|
| **Button / tag** | rectRadius: 0 | rectRadius: 0.05 | rectRadius: 0.1 | rectRadius: 0.2 |
| **Card / container** | rectRadius: 0.03 | rectRadius: 0.1 | rectRadius: 0.2 | rectRadius: 0.3 |
| **Image frame** | rectRadius: 0 | rectRadius: 0.08 | rectRadius: 0.15 | rectRadius: 0.25 |
| **Input-like shape** | rectRadius: 0 | rectRadius: 0.05 | rectRadius: 0.1 | rectRadius: 0.2 |
| **Badge** | rectRadius: 0.02 | rectRadius: 0.05 | rectRadius: 0.08 | rectRadius: 0.15 |
| **Avatar frame** | rectRadius: 0 | rectRadius: 0.1 | rectRadius: 0.2 | rectRadius: 0.5 (circle) |

### PptxGenJS corner radius examples

```javascript
// Sharp-style card
slide.addShape("rect", {
  x: 0.5, y: 1, w: 4, h: 2.5,
  fill: { color: "F5F5F5" },
  rectRadius: 0.03
});

// Rounded-style card
slide.addShape("rect", {
  x: 0.5, y: 1, w: 4, h: 2.5,
  fill: { color: "F5F5F5" },
  rectRadius: 0.2
});

// Pill-style button (height 0.4" → rectRadius 0.2" reads as a pill)
slide.addShape("rect", {
  x: 3, y: 4, w: 2, h: 0.4,
  fill: { color: "4A90D9" },
  rectRadius: 0.2
});
```

---

# Mixing rules

## 1. Outer container radius ≥ inner radius

```javascript
// Correct: outer > inner
card:   rectRadius: 0.2
button: rectRadius: 0.1

// Wrong: inner > outer → visual overflow
card:   rectRadius: 0.1
button: rectRadius: 0.2
```

## 2. Information density drives spacing

| Zone type | Suggested styles |
|---|---|
| Data-heavy | Sharp / Soft (tighter gaps) |
| Reading / browsing | Rounded / Pill (roomier gaps) |
| Title area | Soft / Rounded (middle ground) |

## 3. Radius vs. element height

| Height | Sharp | Soft | Rounded | Pill |
|---|---|---|---|---|
| Small (< 0.3") | 0" | 0.03" | 0.08" | height / 2 |
| Medium (0.3" ~ 0.6") | 0.02" | 0.05" | 0.12" | height / 2 |
| Large (0.6" ~ 1.2") | 0.03" | 0.08" | 0.2" | 0.3" |
| Extra large (> 1.2") | 0.05" | 0.12" | 0.25" | 0.4" |

> **Pill tip**: For a true pill, set `rectRadius = element height / 2`.

---

# Typography (PPT)

| Use | Size (pt) | Notes |
|---|---|---|
| Footnotes / sources | 10 ~ 12 | Minimum readable |
| Body / description | 14 ~ 16 | Standard body |
| Subtitle | 18 ~ 22 | Secondary heading |
| Title | 28 ~ 36 | Slide title |
| Display | 44 ~ 60 | Cover / section titles |
| Stat highlight | 60 ~ 96 | Key numbers |

---

# Spacing (PPT)

Based on 10" × 5.625" slides:

| Use | Suggested (in.) |
|---|---|
| Icon to text | 0.08" ~ 0.15" |
| List item gap | 0.15" ~ 0.25" |
| Card padding | 0.2" ~ 0.4" |
| Between groups | 0.3" ~ 0.5" |
| Safe page margin | 0.4" ~ 0.6" |
| Major blocks | 0.5" ~ 0.8" |

---

# Quick picker

| Deck type | Suggested style | Why |
|---|---|---|
| Investment research / equity memo / IC deck | Sharp & Compact (+ **investment-research-skill**) | Dense tables, thesis-led titles, sourced data |
| Finance / data reports | Sharp & Compact | Dense, serious |
| Corporate / business | Soft & Balanced | Balanced tone |
| Product / marketing | Rounded & Spacious | Modern, approachable |
| Launch / brand | Pill & Airy | Premium, bold |
| Training / education | Soft / Rounded | Clear, friendly |
| Technical talks | Sharp / Soft | Professional, readable |
