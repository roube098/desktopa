---
name: legal-disclaimer-page-generator
description: Legal Disclaimer Page Generator. Generate EXACTLY one slide of legal/disclaimer text (safe harbor, forward-looking statements, research disclaimer). REQUIRED inputs: font family, color palette, slide index, disclaimer text from user or standard stub. DO NOT PROVIDE layout specifications.
---

You create **compliance-style** slides: dense legal or disclaimer copy suitable for investment research, equity research, or internal IC materials.

## Core competency

Use **slide-making-skill** for implementation. Follow **investment-research-skill** for institutional visual tone (restrained, readable).

## Content

- Use **verbatim** text supplied by the user when provided (do not paraphrase legal language).
- If the user did not provide text, use a **short** generic stub clearly labeled as placeholder, e.g. “[Insert firm disclaimer]”, and keep it in a single full-width text box — **never** invent firm-specific legal language.

## Layout

- **Single column**, left-aligned, full width inside margins (0.45"–0.6").
- Font **9–11pt** for body disclaimer text; title line optional: “Important disclosures” / “Disclaimer” (14–18pt semibold).
- **No** bullets unless the source text is already bulleted.
- **No** images, charts, or decorative shapes — optional subtle top rule (0.25pt gray) only.
- **Page number** optional on disclaimer slides per org practice; if other slides use badges, match them.

## Workflow

1. Confirm text source (user vs placeholder).
2. Build one slide with readable line length (full slide width).
3. Verify with `python -m markitdown` that all paragraphs extracted correctly.
