const PptxGenJS = require("pptxgenjs");
const {
  warnIfSlideHasOverlaps,
  warnIfSlideElementsOutOfBounds,
} = require("./pptxgenjs_helpers");

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 inches
pptx.author = "Excelor";
pptx.subject = "Investor Deck";
pptx.title = "Excelor — Self-Evolving AI Agent Platform";

const FONT = "Segoe UI";
const FONT_BOLD = "Segoe UI";

const C = {
  bg: "0B0F1A",
  bgCard: "141A2E",
  accent: "00D4FF",
  accentAlt: "7C5CFC",
  green: "00E676",
  orange: "FF9100",
  white: "FFFFFF",
  gray: "9CA3AF",
  grayLight: "D1D5DB",
  gradientTop: "0F1629",
  gradientBot: "0B0F1A",
  cardBorder: "1E293B",
};

function addBg(slide) {
  slide.background = { fill: C.bg };
}

function addFooter(slide, slideNum, total) {
  slide.addText(`EXCELOR  |  CONFIDENTIAL`, {
    x: 0.5,
    y: 7.0,
    w: 5,
    h: 0.35,
    fontSize: 8,
    fontFace: FONT,
    color: C.gray,
    valign: "bottom",
  });
  slide.addText(`${slideNum} / ${total}`, {
    x: 10.5,
    y: 7.0,
    w: 2.33,
    h: 0.35,
    fontSize: 8,
    fontFace: FONT,
    color: C.gray,
    align: "right",
    valign: "bottom",
  });
}

function addAccentLine(slide, x, y, w) {
  slide.addShape("rect", {
    x,
    y,
    w,
    h: 0.04,
    fill: { color: C.accent },
    rectRadius: 0.02,
  });
}

function addCard(slide, x, y, w, h, opts = {}) {
  slide.addShape("rect", {
    x,
    y,
    w,
    h,
    fill: { color: opts.fill || C.bgCard },
    rectRadius: 0.12,
    line: { color: C.cardBorder, pt: 0.5 },
  });
}

function addIconCircle(slide, x, y, emoji, size = 0.55) {
  slide.addShape("ellipse", {
    x: x,
    y: y,
    w: size,
    h: size,
    fill: { color: "1A2340" },
    line: { color: C.accent, pt: 1 },
  });
  slide.addText(emoji, {
    x: x,
    y: y,
    w: size,
    h: size,
    fontSize: 20,
    fontFace: "Segoe UI Emoji",
    align: "center",
    valign: "mid",
  });
}

const TOTAL = 12;

// ──────────────────────────────────────────────
// SLIDE 1: Title
// ──────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addBg(s);

  // Decorative gradient shapes
  s.addShape("rect", {
    x: -1,
    y: -1,
    w: 6,
    h: 9.5,
    fill: { color: "0D1225" },
    rotate: -5,
  }); // intentional overlap with bg

  addAccentLine(s, 1.0, 2.6, 2.5);

  s.addText("EXCELOR", {
    x: 1.0,
    y: 2.8,
    w: 8,
    h: 1.2,
    fontSize: 54,
    fontFace: FONT_BOLD,
    bold: true,
    color: C.white,
    letterSpacing: 6,
  });

  s.addText("The Self-Evolving AI Agent Platform", {
    x: 1.0,
    y: 3.9,
    w: 8,
    h: 0.7,
    fontSize: 22,
    fontFace: FONT,
    color: C.accent,
  });

  s.addText(
    "Autonomous agents that research, invest, automate,\nand continuously improve themselves.",
    {
      x: 1.0,
      y: 4.7,
      w: 8,
      h: 0.9,
      fontSize: 14,
      fontFace: FONT,
      color: C.grayLight,
      lineSpacingMultiple: 1.4,
    }
  );

  s.addText("Investor Presentation  |  April 2026", {
    x: 1.0,
    y: 6.0,
    w: 6,
    h: 0.4,
    fontSize: 12,
    fontFace: FONT,
    color: C.gray,
  });

  addFooter(s, 1, TOTAL);
  warnIfSlideHasOverlaps(s, pptx);
  warnIfSlideElementsOutOfBounds(s, pptx);
}

// ──────────────────────────────────────────────
// SLIDE 2: The Problem
// ──────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addBg(s);

  s.addText("THE PROBLEM", {
    x: 0.8,
    y: 0.5,
    w: 6,
    h: 0.6,
    fontSize: 12,
    fontFace: FONT,
    bold: true,
    color: C.accent,
    letterSpacing: 3,
  });

  s.addText("AI tools today are passive assistants.\nThey wait. They don't act.", {
    x: 0.8,
    y: 1.1,
    w: 11,
    h: 1.0,
    fontSize: 28,
    fontFace: FONT_BOLD,
    bold: true,
    color: C.white,
    lineSpacingMultiple: 1.3,
  });

  const problems = [
    {
      icon: "\u26A0\uFE0F",
      title: "Fragmented Workflows",
      desc: "Professionals juggle 10+ tools for research, trading, documents, and automation.",
    },
    {
      icon: "\u23F3",
      title: "Manual Repetition",
      desc: "Hours wasted on tasks that could be fully automated — job apps, market analysis, reporting.",
    },
    {
      icon: "\uD83E\uDDE0",
      title: "No Learning Loop",
      desc: "Current AI has no memory of what works. Every session starts from zero.",
    },
    {
      icon: "\uD83D\uDD12",
      title: "Walled Gardens",
      desc: "LLM providers lock users into single ecosystems with no portability.",
    },
  ];

  problems.forEach((p, i) => {
    const cx = 0.8 + i * 3.0;
    const cy = 2.7;
    addCard(s, cx, cy, 2.75, 3.3);
    addIconCircle(s, cx + 1.1, cy + 0.35, p.icon);
    s.addText(p.title, {
      x: cx + 0.2,
      y: cy + 1.15,
      w: 2.35,
      h: 0.5,
      fontSize: 14,
      fontFace: FONT_BOLD,
      bold: true,
      color: C.white,
      align: "center",
      valign: "top",
    });
    s.addText(p.desc, {
      x: cx + 0.2,
      y: cy + 1.65,
      w: 2.35,
      h: 1.4,
      fontSize: 11,
      fontFace: FONT,
      color: C.grayLight,
      align: "center",
      valign: "top",
      lineSpacingMultiple: 1.3,
    });
  });

  addFooter(s, 2, TOTAL);
  warnIfSlideHasOverlaps(s, pptx);
  warnIfSlideElementsOutOfBounds(s, pptx);
}

// ──────────────────────────────────────────────
// SLIDE 3: The Solution
// ──────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addBg(s);

  s.addText("THE SOLUTION", {
    x: 0.8,
    y: 0.5,
    w: 6,
    h: 0.6,
    fontSize: 12,
    fontFace: FONT,
    bold: true,
    color: C.accent,
    letterSpacing: 3,
  });

  s.addText("Excelor: One platform.\nAutonomous agents that actually do the work.", {
    x: 0.8,
    y: 1.1,
    w: 11,
    h: 1.0,
    fontSize: 28,
    fontFace: FONT_BOLD,
    bold: true,
    color: C.white,
    lineSpacingMultiple: 1.3,
  });

  s.addText(
    "Excelor is a desktop AI workspace that combines a multi-provider agent runtime, real-time document editing, browser automation, and a self-improving skills system — all running locally on your machine.",
    {
      x: 0.8,
      y: 2.3,
      w: 11.5,
      h: 0.8,
      fontSize: 13,
      fontFace: FONT,
      color: C.grayLight,
      lineSpacingMultiple: 1.4,
    }
  );

  const pillars = [
    { label: "Autonomous\nAgents", color: C.accent },
    { label: "Multi-Provider\nLLMs", color: C.accentAlt },
    { label: "Plugin\nEcosystem", color: C.green },
    { label: "Self-Optimizing\nSkills", color: C.orange },
  ];

  // Central rectangle
  addCard(s, 4.4, 3.6, 4.5, 2.8);
  s.addText("EXCELOR\nDESKTOP", {
    x: 4.4,
    y: 4.3,
    w: 4.5,
    h: 1.2,
    fontSize: 22,
    fontFace: FONT_BOLD,
    bold: true,
    color: C.white,
    align: "center",
    valign: "mid",
    letterSpacing: 2,
  });

  // Pillars around
  const positions = [
    { x: 0.6, y: 3.8 },
    { x: 0.6, y: 5.3 },
    { x: 9.4, y: 3.8 },
    { x: 9.4, y: 5.3 },
  ];
  pillars.forEach((p, i) => {
    const pos = positions[i];
    s.addShape("rect", {
      x: pos.x,
      y: pos.y,
      w: 3.3,
      h: 1.1,
      fill: { color: C.bgCard },
      rectRadius: 0.1,
      line: { color: p.color, pt: 1.5 },
    });
    s.addText(p.label, {
      x: pos.x,
      y: pos.y,
      w: 3.3,
      h: 1.1,
      fontSize: 13,
      fontFace: FONT_BOLD,
      bold: true,
      color: p.color,
      align: "center",
      valign: "mid",
      lineSpacingMultiple: 1.3,
    });
  });

  addFooter(s, 3, TOTAL);
  warnIfSlideHasOverlaps(s, pptx);
  warnIfSlideElementsOutOfBounds(s, pptx);
}

// ──────────────────────────────────────────────
// SLIDE 4: Platform Capabilities Overview
// ──────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addBg(s);

  s.addText("PLATFORM CAPABILITIES", {
    x: 0.8,
    y: 0.5,
    w: 6,
    h: 0.6,
    fontSize: 12,
    fontFace: FONT,
    bold: true,
    color: C.accent,
    letterSpacing: 3,
  });

  s.addText("Everything an autonomous AI agent needs — built in.", {
    x: 0.8,
    y: 1.1,
    w: 11,
    h: 0.7,
    fontSize: 26,
    fontFace: FONT_BOLD,
    bold: true,
    color: C.white,
  });

  const caps = [
    { emoji: "\uD83D\uDCCA", title: "Financial Research", desc: "SEC filings, earnings, fundamentals, insider trades, real-time prices" },
    { emoji: "\uD83C\uDF10", title: "Web Search & Browse", desc: "Full Playwright browser automation with intelligent page extraction" },
    { emoji: "\uD83D\uDCC4", title: "Document Workspace", desc: "Create & edit XLSX, DOCX, PDF, PPTX natively with OnlyOffice" },
    { emoji: "\uD83E\uDD16", title: "Multi-Agent System", desc: "Spawn sub-agents, delegate tasks, coordinate complex workflows" },
    { emoji: "\uD83D\uDD0C", title: "Plugin Architecture", desc: "Extensible skills, tools, hooks, and custom agent definitions" },
    { emoji: "\u26A1", title: "Multi-Provider LLMs", desc: "OpenAI, Anthropic, Google, xAI, DeepSeek, Ollama, and more" },
  ];

  caps.forEach((c, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = 0.8 + col * 4.0;
    const cy = 2.2 + row * 2.5;
    addCard(s, cx, cy, 3.75, 2.2);
    s.addText(c.emoji, {
      x: cx + 0.25,
      y: cy + 0.25,
      w: 0.5,
      h: 0.5,
      fontSize: 22,
      fontFace: "Segoe UI Emoji",
    });
    s.addText(c.title, {
      x: cx + 0.85,
      y: cy + 0.25,
      w: 2.6,
      h: 0.45,
      fontSize: 14,
      fontFace: FONT_BOLD,
      bold: true,
      color: C.white,
      valign: "mid",
    });
    s.addText(c.desc, {
      x: cx + 0.25,
      y: cy + 0.9,
      w: 3.25,
      h: 1.05,
      fontSize: 11,
      fontFace: FONT,
      color: C.grayLight,
      valign: "top",
      lineSpacingMultiple: 1.3,
    });
  });

  addFooter(s, 4, TOTAL);
  warnIfSlideHasOverlaps(s, pptx);
  warnIfSlideElementsOutOfBounds(s, pptx);
}

// ──────────────────────────────────────────────
// SLIDE 5: Crypto Investment Strategy (from X post)
// ──────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addBg(s);

  s.addText("CRYPTO INVESTMENT STRATEGY", {
    x: 0.8,
    y: 0.5,
    w: 8,
    h: 0.6,
    fontSize: 12,
    fontFace: FONT,
    bold: true,
    color: C.green,
    letterSpacing: 3,
  });

  s.addText("Real-time strategy generation, backtesting,\nand autonomous crypto trading.", {
    x: 0.8,
    y: 1.1,
    w: 11,
    h: 1.0,
    fontSize: 26,
    fontFace: FONT_BOLD,
    bold: true,
    color: C.white,
    lineSpacingMultiple: 1.3,
  });

  // Flow diagram
  const steps = [
    { label: "Market Data\nIngestion", sub: "Real-time feeds,\non-chain analytics", color: C.accent },
    { label: "Strategy\nGeneration", sub: "AI-driven signal\ndetection & modeling", color: C.accentAlt },
    { label: "Backtest &\nValidation", sub: "Historical simulation\n& risk scoring", color: C.green },
    { label: "Live\nExecution", sub: "Autonomous trades\nwith safeguards", color: C.orange },
  ];

  steps.forEach((st, i) => {
    const cx = 0.6 + i * 3.15;
    const cy = 2.6;
    s.addShape("rect", {
      x: cx,
      y: cy,
      w: 2.85,
      h: 1.4,
      fill: { color: C.bgCard },
      rectRadius: 0.1,
      line: { color: st.color, pt: 1.5 },
    });
    s.addText(st.label, {
      x: cx,
      y: cy + 0.15,
      w: 2.85,
      h: 0.65,
      fontSize: 14,
      fontFace: FONT_BOLD,
      bold: true,
      color: st.color,
      align: "center",
      valign: "mid",
      lineSpacingMultiple: 1.2,
    });
    s.addText(st.sub, {
      x: cx,
      y: cy + 0.75,
      w: 2.85,
      h: 0.55,
      fontSize: 10,
      fontFace: FONT,
      color: C.grayLight,
      align: "center",
      valign: "top",
      lineSpacingMultiple: 1.2,
    });
    // Arrow
    if (i < steps.length - 1) {
      s.addText("\u25B6", {
        x: cx + 2.85,
        y: cy + 0.4,
        w: 0.3,
        h: 0.6,
        fontSize: 16,
        fontFace: FONT,
        color: C.gray,
        align: "center",
        valign: "mid",
      });
    }
  });

  // Key metrics
  addCard(s, 0.6, 4.5, 12.1, 2.3);
  s.addText("KEY DIFFERENTIATORS", {
    x: 1.0,
    y: 4.7,
    w: 5,
    h: 0.4,
    fontSize: 11,
    fontFace: FONT,
    bold: true,
    color: C.accent,
    letterSpacing: 2,
  });

  const diffs = [
    { bullet: "\u2713", text: "Generates and tests investment strategies in real-time — not just analysis, but execution" },
    { bullet: "\u2713", text: "Develops custom crypto trading algorithms using AI-driven signal detection and on-chain data" },
    { bullet: "\u2713", text: "Continuous self-optimization: strategies improve over time as the agent learns from outcomes" },
    { bullet: "\u2713", text: "Full transparency — every decision, backtest result, and trade is logged and auditable" },
  ];

  diffs.forEach((d, i) => {
    s.addText(d.bullet, {
      x: 1.0,
      y: 5.2 + i * 0.36,
      w: 0.3,
      h: 0.32,
      fontSize: 12,
      fontFace: FONT,
      bold: true,
      color: C.green,
      valign: "mid",
    });
    s.addText(d.text, {
      x: 1.35,
      y: 5.2 + i * 0.36,
      w: 10.8,
      h: 0.32,
      fontSize: 11,
      fontFace: FONT,
      color: C.grayLight,
      valign: "mid",
    });
  });

  // Source reference
  s.addText("Demo: https://t.co/wIDd2SaYbp", {
    x: 0.8,
    y: 6.7,
    w: 5,
    h: 0.3,
    fontSize: 9,
    fontFace: FONT,
    color: C.gray,
    italic: true,
  });

  addFooter(s, 5, TOTAL);
  warnIfSlideHasOverlaps(s, pptx);
  warnIfSlideElementsOutOfBounds(s, pptx);
}

// ──────────────────────────────────────────────
// SLIDE 6: Web Automation — Apply for Jobs
// ──────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addBg(s);

  s.addText("WEB AUTOMATION", {
    x: 0.8,
    y: 0.5,
    w: 6,
    h: 0.6,
    fontSize: 12,
    fontFace: FONT,
    bold: true,
    color: C.accentAlt,
    letterSpacing: 3,
  });

  s.addText("Autonomous browser agents that navigate,\nfill forms, and complete real-world tasks.", {
    x: 0.8,
    y: 1.1,
    w: 11,
    h: 1.0,
    fontSize: 26,
    fontFace: FONT_BOLD,
    bold: true,
    color: C.white,
    lineSpacingMultiple: 1.3,
  });

  // Left column - Use cases
  addCard(s, 0.8, 2.5, 5.7, 4.2);
  s.addText("USE CASES", {
    x: 1.2,
    y: 2.7,
    w: 4,
    h: 0.4,
    fontSize: 11,
    fontFace: FONT,
    bold: true,
    color: C.accentAlt,
    letterSpacing: 2,
  });

  const useCases = [
    { title: "Job Applications", desc: "Autonomously browse job boards, tailor resumes, fill applications, and submit — across LinkedIn, Indeed, and more." },
    { title: "Data Collection", desc: "Scrape structured data from any website, extract tables, download documents, and compile reports." },
    { title: "Form Automation", desc: "Handle multi-step forms, CAPTCHAs, file uploads, and authentication flows." },
    { title: "Monitoring", desc: "Continuous web monitoring for price changes, availability, regulatory filings, and competitor activity." },
  ];

  useCases.forEach((uc, i) => {
    const y = 3.2 + i * 0.85;
    s.addText(uc.title, {
      x: 1.2,
      y: y,
      w: 4.8,
      h: 0.3,
      fontSize: 12,
      fontFace: FONT_BOLD,
      bold: true,
      color: C.white,
    });
    s.addText(uc.desc, {
      x: 1.2,
      y: y + 0.28,
      w: 4.8,
      h: 0.5,
      fontSize: 10,
      fontFace: FONT,
      color: C.grayLight,
      lineSpacingMultiple: 1.2,
    });
  });

  // Right column - Technology
  addCard(s, 6.8, 2.5, 5.7, 4.2);
  s.addText("POWERED BY", {
    x: 7.2,
    y: 2.7,
    w: 4,
    h: 0.4,
    fontSize: 11,
    fontFace: FONT,
    bold: true,
    color: C.accentAlt,
    letterSpacing: 2,
  });

  const techItems = [
    { label: "Playwright Engine", desc: "Full browser control — clicks, typing, navigation, screenshots" },
    { label: "Vision + DOM", desc: "Combines visual understanding with DOM analysis for reliable element targeting" },
    { label: "Multi-Tab Orchestration", desc: "Manages multiple browser tabs and windows simultaneously" },
    { label: "Session Persistence", desc: "Maintains login state, cookies, and context across tasks" },
  ];

  techItems.forEach((t, i) => {
    const y = 3.2 + i * 0.85;
    s.addShape("rect", {
      x: 7.2,
      y: y,
      w: 0.06,
      h: 0.65,
      fill: { color: C.accentAlt },
      rectRadius: 0.03,
    });
    s.addText(t.label, {
      x: 7.5,
      y: y,
      w: 4.5,
      h: 0.3,
      fontSize: 12,
      fontFace: FONT_BOLD,
      bold: true,
      color: C.white,
    });
    s.addText(t.desc, {
      x: 7.5,
      y: y + 0.28,
      w: 4.5,
      h: 0.4,
      fontSize: 10,
      fontFace: FONT,
      color: C.grayLight,
      lineSpacingMultiple: 1.2,
    });
  });

  addFooter(s, 6, TOTAL);
  warnIfSlideHasOverlaps(s, pptx);
  warnIfSlideElementsOutOfBounds(s, pptx);
}

// ──────────────────────────────────────────────
// SLIDE 7: Self-Optimizing Agents
// ──────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addBg(s);

  s.addText("SELF-OPTIMIZING AGENTS", {
    x: 0.8,
    y: 0.5,
    w: 8,
    h: 0.6,
    fontSize: 12,
    fontFace: FONT,
    bold: true,
    color: C.orange,
    letterSpacing: 3,
  });

  s.addText("Agents that build, evaluate,\nand improve themselves.", {
    x: 0.8,
    y: 1.1,
    w: 11,
    h: 1.0,
    fontSize: 28,
    fontFace: FONT_BOLD,
    bold: true,
    color: C.white,
    lineSpacingMultiple: 1.3,
  });

  s.addText(
    "Excelor agents don't just execute tasks — they write their own skills, evaluate their performance, and evolve their capabilities over time. This is the core breakthrough: AI that improves itself without human intervention.",
    {
      x: 0.8,
      y: 2.3,
      w: 11.5,
      h: 0.7,
      fontSize: 12,
      fontFace: FONT,
      color: C.grayLight,
      lineSpacingMultiple: 1.4,
    }
  );

  // Circular flow
  const cycle = [
    { label: "EXECUTE\nTASK", x: 1.5, y: 3.5, color: C.accent },
    { label: "EVALUATE\nOUTCOME", x: 4.65, y: 3.5, color: C.accentAlt },
    { label: "GENERATE\nNEW SKILL", x: 7.8, y: 3.5, color: C.green },
    { label: "INTEGRATE\n& IMPROVE", x: 10.0, y: 3.5, color: C.orange },
  ];

  cycle.forEach((c, i) => {
    s.addShape("rect", {
      x: c.x,
      y: c.y,
      w: 2.5,
      h: 1.2,
      fill: { color: C.bgCard },
      rectRadius: 0.1,
      line: { color: c.color, pt: 2 },
    });
    s.addText(c.label, {
      x: c.x,
      y: c.y,
      w: 2.5,
      h: 1.2,
      fontSize: 13,
      fontFace: FONT_BOLD,
      bold: true,
      color: c.color,
      align: "center",
      valign: "mid",
      lineSpacingMultiple: 1.2,
    });
    if (i < cycle.length - 1) {
      s.addText("\u25B6", {
        x: c.x + 2.5,
        y: c.y + 0.3,
        w: 0.65,
        h: 0.6,
        fontSize: 16,
        fontFace: FONT,
        color: C.gray,
        align: "center",
        valign: "mid",
      });
    }
  });

  // Return arrow text
  s.addShape("rect", {
    x: 1.5,
    y: 5.0,
    w: 11.0,
    h: 0.04,
    fill: { color: C.orange },
    rectRadius: 0.02,
  });
  s.addText("\u25C0  Continuous improvement loop", {
    x: 4.0,
    y: 5.1,
    w: 5.33,
    h: 0.35,
    fontSize: 10,
    fontFace: FONT,
    color: C.orange,
    align: "center",
  });

  // Bottom details
  const details = [
    { title: "SKILL.md Authoring", desc: "Agents create new skills as markdown-driven workflows that persist across sessions" },
    { title: "Scratchpad Memory", desc: "Context management system preserves learnings while staying within token limits" },
    { title: "Plugin Self-Assembly", desc: "Agents can generate entire plugin packages — tools, hooks, and agent definitions" },
  ];

  details.forEach((d, i) => {
    const cx = 0.8 + i * 4.15;
    addCard(s, cx, 5.65, 3.9, 1.2);
    s.addText(d.title, {
      x: cx + 0.2,
      y: 5.75,
      w: 3.5,
      h: 0.35,
      fontSize: 12,
      fontFace: FONT_BOLD,
      bold: true,
      color: C.white,
    });
    s.addText(d.desc, {
      x: cx + 0.2,
      y: 6.1,
      w: 3.5,
      h: 0.55,
      fontSize: 10,
      fontFace: FONT,
      color: C.grayLight,
      lineSpacingMultiple: 1.2,
    });
  });

  addFooter(s, 7, TOTAL);
  warnIfSlideHasOverlaps(s, pptx);
  warnIfSlideElementsOutOfBounds(s, pptx);
}

// ──────────────────────────────────────────────
// SLIDE 8: Architecture
// ──────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addBg(s);

  s.addText("ARCHITECTURE", {
    x: 0.8,
    y: 0.5,
    w: 6,
    h: 0.6,
    fontSize: 12,
    fontFace: FONT,
    bold: true,
    color: C.accent,
    letterSpacing: 3,
  });

  s.addText("Local-first. Multi-provider. Extensible.", {
    x: 0.8,
    y: 1.1,
    w: 11,
    h: 0.7,
    fontSize: 26,
    fontFace: FONT_BOLD,
    bold: true,
    color: C.white,
  });

  // Architecture layers
  const layers = [
    {
      label: "DESKTOP  UI",
      sub: "Electron  •  React 19  •  Tailwind  •  Framer Motion",
      y: 2.2,
      color: C.accent,
    },
    {
      label: "AGENT  RUNTIME",
      sub: "Bun/TypeScript  •  Tool Registry  •  Scratchpad  •  SSE Streaming",
      y: 3.3,
      color: C.accentAlt,
    },
    {
      label: "DOCUMENT  ENGINE",
      sub: "OnlyOffice (Docker)  •  XLSX/DOCX/PDF/PPTX  •  Flask Backend",
      y: 4.4,
      color: C.green,
    },
    {
      label: "LLM  PROVIDERS",
      sub: "OpenAI  •  Anthropic  •  Google  •  xAI  •  DeepSeek  •  Ollama  •  OpenRouter",
      y: 5.5,
      color: C.orange,
    },
  ];

  layers.forEach((l) => {
    s.addShape("rect", {
      x: 1.5,
      y: l.y,
      w: 10.33,
      h: 0.85,
      fill: { color: C.bgCard },
      rectRadius: 0.1,
      line: { color: l.color, pt: 1.5 },
    });
    s.addText(l.label, {
      x: 1.8,
      y: l.y + 0.05,
      w: 4,
      h: 0.4,
      fontSize: 13,
      fontFace: FONT_BOLD,
      bold: true,
      color: l.color,
    });
    s.addText(l.sub, {
      x: 1.8,
      y: l.y + 0.4,
      w: 9.5,
      h: 0.35,
      fontSize: 10,
      fontFace: FONT,
      color: C.grayLight,
    });
  });

  // Side labels
  s.addShape("rect", {
    x: 0.4,
    y: 2.2,
    w: 0.06,
    h: 4.15,
    fill: { color: C.accent },
    rectRadius: 0.03,
  });
  s.addText("L\nO\nC\nA\nL", {
    x: 0.55,
    y: 3.5,
    w: 0.5,
    h: 2.0,
    fontSize: 10,
    fontFace: FONT_BOLD,
    bold: true,
    color: C.accent,
    align: "center",
    valign: "mid",
    lineSpacingMultiple: 1.1,
  });

  addFooter(s, 8, TOTAL);
  warnIfSlideHasOverlaps(s, pptx);
  warnIfSlideElementsOutOfBounds(s, pptx);
}

// ──────────────────────────────────────────────
// SLIDE 9: Market Opportunity
// ──────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addBg(s);

  s.addText("MARKET OPPORTUNITY", {
    x: 0.8,
    y: 0.5,
    w: 6,
    h: 0.6,
    fontSize: 12,
    fontFace: FONT,
    bold: true,
    color: C.accent,
    letterSpacing: 3,
  });

  s.addText("The AI agent market is exploding.", {
    x: 0.8,
    y: 1.1,
    w: 11,
    h: 0.7,
    fontSize: 28,
    fontFace: FONT_BOLD,
    bold: true,
    color: C.white,
  });

  // Market size blocks
  const markets = [
    { label: "AI Agent\nMarket", value: "$65B", sub: "by 2030\n(47% CAGR)", color: C.accent },
    { label: "Algorithmic\nTrading", value: "$31B", sub: "by 2028\n(12% CAGR)", color: C.green },
    { label: "RPA /\nAutomation", value: "$26B", sub: "by 2028\n(27% CAGR)", color: C.accentAlt },
    { label: "AI-Powered\nFinance", value: "$44B", sub: "by 2029\n(34% CAGR)", color: C.orange },
  ];

  markets.forEach((m, i) => {
    const cx = 0.6 + i * 3.15;
    addCard(s, cx, 2.2, 2.9, 2.8);
    s.addText(m.label, {
      x: cx + 0.2,
      y: 2.4,
      w: 2.5,
      h: 0.65,
      fontSize: 12,
      fontFace: FONT,
      color: C.grayLight,
      align: "center",
      valign: "mid",
      lineSpacingMultiple: 1.2,
    });
    s.addText(m.value, {
      x: cx + 0.2,
      y: 3.1,
      w: 2.5,
      h: 0.8,
      fontSize: 36,
      fontFace: FONT_BOLD,
      bold: true,
      color: m.color,
      align: "center",
      valign: "mid",
    });
    s.addText(m.sub, {
      x: cx + 0.2,
      y: 3.9,
      w: 2.5,
      h: 0.65,
      fontSize: 11,
      fontFace: FONT,
      color: C.gray,
      align: "center",
      valign: "mid",
      lineSpacingMultiple: 1.2,
    });
  });

  // Positioning text
  addCard(s, 0.6, 5.3, 12.1, 1.4);
  s.addText("EXCELOR'S POSITION", {
    x: 1.0,
    y: 5.45,
    w: 4,
    h: 0.35,
    fontSize: 11,
    fontFace: FONT,
    bold: true,
    color: C.accent,
    letterSpacing: 2,
  });
  s.addText(
    "Excelor sits at the intersection of all four markets — a unified agent platform that handles financial research, algorithmic trading, web automation, and document workflows. No other product combines autonomous execution with self-improving intelligence across these verticals.",
    {
      x: 1.0,
      y: 5.85,
      w: 11.3,
      h: 0.7,
      fontSize: 11,
      fontFace: FONT,
      color: C.grayLight,
      lineSpacingMultiple: 1.4,
    }
  );

  addFooter(s, 9, TOTAL);
  warnIfSlideHasOverlaps(s, pptx);
  warnIfSlideElementsOutOfBounds(s, pptx);
}

// ──────────────────────────────────────────────
// SLIDE 10: Competitive Advantage
// ──────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addBg(s);

  s.addText("COMPETITIVE ADVANTAGE", {
    x: 0.8,
    y: 0.5,
    w: 8,
    h: 0.6,
    fontSize: 12,
    fontFace: FONT,
    bold: true,
    color: C.accent,
    letterSpacing: 3,
  });

  s.addText("Why Excelor wins.", {
    x: 0.8,
    y: 1.1,
    w: 11,
    h: 0.7,
    fontSize: 28,
    fontFace: FONT_BOLD,
    bold: true,
    color: C.white,
  });

  // Comparison table header
  const cols = ["", "Excelor", "ChatGPT /\nCopilot", "Traditional\nRPA", "Crypto\nBots"];
  const colW = [3.0, 2.2, 2.2, 2.2, 2.2];
  let tableX = 0.8;
  const tableY = 2.2;

  cols.forEach((col, i) => {
    const x = tableX + colW.slice(0, i).reduce((a, b) => a + b, 0);
    s.addShape("rect", {
      x,
      y: tableY,
      w: colW[i],
      h: 0.6,
      fill: { color: i === 1 ? "0D2847" : i === 0 ? C.bg : C.bgCard },
      line: { color: C.cardBorder, pt: 0.5 },
    });
    s.addText(col, {
      x,
      y: tableY,
      w: colW[i],
      h: 0.6,
      fontSize: 11,
      fontFace: FONT_BOLD,
      bold: true,
      color: i === 1 ? C.accent : C.grayLight,
      align: "center",
      valign: "mid",
      lineSpacingMultiple: 1.1,
    });
  });

  const rows = [
    ["Autonomous Execution", "\u2705", "\u274C", "\u2705", "\u2705"],
    ["Self-Improving Skills", "\u2705", "\u274C", "\u274C", "\u274C"],
    ["Multi-Provider LLMs", "\u2705", "\u274C", "\u274C", "\u274C"],
    ["Crypto Strategy Gen", "\u2705", "\u274C", "\u274C", "\u26A0\uFE0F"],
    ["Web Automation", "\u2705", "\u274C", "\u2705", "\u274C"],
    ["Document Workspace", "\u2705", "\u26A0\uFE0F", "\u274C", "\u274C"],
    ["Local-First / Private", "\u2705", "\u274C", "\u2705", "\u26A0\uFE0F"],
    ["Plugin Ecosystem", "\u2705", "\u26A0\uFE0F", "\u26A0\uFE0F", "\u274C"],
  ];

  rows.forEach((row, ri) => {
    const ry = tableY + 0.6 + ri * 0.52;
    row.forEach((cell, ci) => {
      const x = tableX + colW.slice(0, ci).reduce((a, b) => a + b, 0);
      s.addShape("rect", {
        x,
        y: ry,
        w: colW[ci],
        h: 0.52,
        fill: { color: ci === 1 ? "0D2847" : ci === 0 ? C.bg : C.bgCard },
        line: { color: C.cardBorder, pt: 0.25 },
      });
      s.addText(cell, {
        x,
        y: ry,
        w: colW[ci],
        h: 0.52,
        fontSize: ci === 0 ? 10 : 14,
        fontFace: ci === 0 ? FONT : "Segoe UI Emoji",
        color: ci === 0 ? C.grayLight : C.white,
        align: ci === 0 ? "left" : "center",
        valign: "mid",
        margin: ci === 0 ? [0, 0, 0, 8] : 0,
      });
    });
  });

  addFooter(s, 10, TOTAL);
  warnIfSlideHasOverlaps(s, pptx);
  warnIfSlideElementsOutOfBounds(s, pptx);
}

// ──────────────────────────────────────────────
// SLIDE 11: Business Model
// ──────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addBg(s);

  s.addText("BUSINESS MODEL", {
    x: 0.8,
    y: 0.5,
    w: 6,
    h: 0.6,
    fontSize: 12,
    fontFace: FONT,
    bold: true,
    color: C.accent,
    letterSpacing: 3,
  });

  s.addText("Multiple revenue streams. High retention.", {
    x: 0.8,
    y: 1.1,
    w: 11,
    h: 0.7,
    fontSize: 26,
    fontFace: FONT_BOLD,
    bold: true,
    color: C.white,
  });

  const models = [
    {
      title: "Pro Subscription",
      price: "$49/mo",
      desc: "Full agent runtime, all LLM providers, priority skills, web automation",
      color: C.accent,
    },
    {
      title: "Enterprise",
      price: "Custom",
      desc: "On-prem deployment, custom agents, SSO, audit logging, SLA",
      color: C.accentAlt,
    },
    {
      title: "Plugin Marketplace",
      price: "Rev Share",
      desc: "Third-party plugins, premium skills, community-built agents",
      color: C.green,
    },
    {
      title: "Trading Alpha",
      price: "AUM Fee",
      desc: "Managed crypto strategies powered by Excelor agents, performance fees",
      color: C.orange,
    },
  ];

  models.forEach((m, i) => {
    const cx = 0.6 + i * 3.15;
    addCard(s, cx, 2.2, 2.9, 3.6);

    s.addShape("rect", {
      x: cx,
      y: 2.2,
      w: 2.9,
      h: 0.06,
      fill: { color: m.color },
      rectRadius: 0.03,
    }); // intentional overlap: top accent bar

    s.addText(m.title, {
      x: cx + 0.2,
      y: 2.5,
      w: 2.5,
      h: 0.5,
      fontSize: 14,
      fontFace: FONT_BOLD,
      bold: true,
      color: C.white,
      align: "center",
      valign: "mid",
    });
    s.addText(m.price, {
      x: cx + 0.2,
      y: 3.1,
      w: 2.5,
      h: 0.7,
      fontSize: 28,
      fontFace: FONT_BOLD,
      bold: true,
      color: m.color,
      align: "center",
      valign: "mid",
    });
    s.addText(m.desc, {
      x: cx + 0.25,
      y: 3.9,
      w: 2.4,
      h: 1.5,
      fontSize: 10,
      fontFace: FONT,
      color: C.grayLight,
      align: "center",
      valign: "top",
      lineSpacingMultiple: 1.4,
    });
  });

  // Bottom note
  addCard(s, 0.6, 6.1, 12.1, 0.7);
  s.addText(
    "Net Revenue Retention target: 140%+  |  Expansion via seat growth, premium plugins, and managed strategies",
    {
      x: 1.0,
      y: 6.1,
      w: 11.3,
      h: 0.7,
      fontSize: 11,
      fontFace: FONT,
      color: C.grayLight,
      align: "center",
      valign: "mid",
    }
  );

  addFooter(s, 11, TOTAL);
  warnIfSlideHasOverlaps(s, pptx);
  warnIfSlideElementsOutOfBounds(s, pptx);
}

// ──────────────────────────────────────────────
// SLIDE 12: Call to Action
// ──────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addBg(s);

  // Decorative
  s.addShape("rect", {
    x: 8,
    y: -1,
    w: 7,
    h: 9.5,
    fill: { color: "0D1225" },
    rotate: 5,
  }); // intentional overlap

  addAccentLine(s, 3.5, 2.2, 6.33);

  s.addText("The future of AI\nis autonomous.", {
    x: 1.0,
    y: 2.5,
    w: 11.33,
    h: 1.6,
    fontSize: 42,
    fontFace: FONT_BOLD,
    bold: true,
    color: C.white,
    align: "center",
    valign: "mid",
    lineSpacingMultiple: 1.2,
  });

  s.addText("Excelor is building it.", {
    x: 1.0,
    y: 4.1,
    w: 11.33,
    h: 0.7,
    fontSize: 24,
    fontFace: FONT,
    color: C.accent,
    align: "center",
    valign: "mid",
  });

  // CTA box
  s.addShape("rect", {
    x: 3.5,
    y: 5.2,
    w: 6.33,
    h: 1.3,
    fill: { color: C.bgCard },
    rectRadius: 0.15,
    line: { color: C.accent, pt: 1.5 },
  });

  s.addText("Let's talk.", {
    x: 3.5,
    y: 5.3,
    w: 6.33,
    h: 0.55,
    fontSize: 20,
    fontFace: FONT_BOLD,
    bold: true,
    color: C.white,
    align: "center",
    valign: "mid",
  });

  s.addText("investors@excelor.ai  |  excelor.ai", {
    x: 3.5,
    y: 5.85,
    w: 6.33,
    h: 0.45,
    fontSize: 13,
    fontFace: FONT,
    color: C.accent,
    align: "center",
    valign: "mid",
  });

  addFooter(s, 12, TOTAL);
  warnIfSlideHasOverlaps(s, pptx);
  warnIfSlideElementsOutOfBounds(s, pptx);
}

// ──────────────────────────────────────────────
// Write output
// ──────────────────────────────────────────────
const outPath = "Excelor_Investor_Deck.pptx";
pptx.writeFile({ fileName: outPath }).then(() => {
  console.log(`Deck saved: ${outPath}`);
});
