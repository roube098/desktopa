/**
 * Dashboard chart — light editorial (pie + pills + capsule Q1/Q2).
 * Run: node slide-01.js  →  slide-01-preview.pptx
 */
const pptxgen = require("pptxgenjs");

const slideConfig = {
  type: "dashboard-chart",
  themeMode: "light-editorial",
  variant: "trends-grid",
  index: 1,
  seriesTitle: "Quarterly review",
  footerDate: "March 2026",
};

const THEME = {
  bg: "FFFFFF",
  primary: "18181B",
  secondary: "71717A",
  accent: "0D9488",
  light: "E4E4E7",
  pieRest: "D4D4D8",
  pillBg: "F4F4F5",
  pillLine: "D4D4D8",
  barMuted: "D4D4D8",
};

/**
 * Synchronous slide factory — no shared mutated option objects between API calls.
 * @param {import("pptxgenjs")} pres
 */
function createSlide(pres) {
  const slide = pres.addSlide();
  slide.background = { color: THEME.bg };

  const m = 0.42;

  slide.addShape(pres.shapes.LINE, {
    x: m,
    y: 0.38,
    w: 10 - 2 * m,
    h: 0,
    line: { color: THEME.light, width: 0.75 },
  });
  slide.addShape(pres.shapes.LINE, {
    x: m,
    y: 2.48,
    w: 10 - 2 * m,
    h: 0,
    line: { color: THEME.light, width: 0.75 },
  });
  slide.addShape(pres.shapes.LINE, {
    x: m,
    y: 5.05,
    w: 10 - 2 * m,
    h: 0,
    line: { color: THEME.light, width: 0.75 },
  });
  slide.addShape(pres.shapes.LINE, {
    x: 3.95,
    y: 0.38,
    w: 0,
    h: 4.67,
    line: { color: THEME.light, width: 0.75 },
  });

  slide.addText("Quarterly snapshot", {
    x: m,
    y: 0.52,
    w: 3.4,
    h: 0.35,
    fontSize: 12,
    fontFace: "Arial",
    color: THEME.accent,
    margin: 0,
  });
  slide.addText(
    "Revenue mix shifted toward recurring lines as expansion cohorts matured. The majority share reflects core accounts; the balance captures pilots and one-time services heading into the next cycle.",
    {
      x: m,
      y: 0.92,
      w: 3.45,
      h: 1.35,
      fontSize: 11,
      fontFace: "Georgia",
      color: THEME.primary,
      margin: 0,
    }
  );

  slide.addChart(
    pres.charts.PIE,
    [
      {
        name: "Mix",
        labels: ["Core share", "Other"],
        values: [62, 38],
      },
    ],
    {
      x: m,
      y: 2.62,
      w: 2.35,
      h: 2.05,
      chartArea: { fill: { color: THEME.bg } },
      chartColors: [THEME.accent, THEME.pieRest],
      showLegend: false,
      showPercent: true,
      dataLabelColor: THEME.secondary,
    }
  );
  slide.addText("62% / 38% split between core and non-core contribution", {
    x: m,
    y: 4.78,
    w: 3.35,
    h: 0.45,
    fontSize: 9,
    fontFace: "Arial",
    color: THEME.secondary,
    margin: 0,
  });

  const pillLabels = ["Sales", "Ops", "Product"];
  let py = 2.62;
  pillLabels.forEach((t) => {
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 4.05,
      y: py,
      w: 2.55,
      h: 0.38,
      fill: { color: THEME.pillBg },
      line: { color: THEME.pillLine, width: 0.5 },
      rectRadius: 0.19,
    });
    slide.addText(t, {
      x: 4.15,
      y: py + 0.08,
      w: 2.35,
      h: 0.28,
      fontSize: 10,
      fontFace: "Arial",
      color: THEME.secondary,
      align: "center",
      margin: 0,
    });
    py += 0.46;
  });
  slide.addText("Focus areas", {
    x: 4.05,
    y: 4.78,
    w: 2.7,
    h: 0.35,
    fontSize: 9,
    fontFace: "Arial",
    color: THEME.secondary,
    margin: 0,
  });

  const colW = 0.52;
  const gap = 0.42;
  const baseX = 6.55;
  const yB = 4.65;
  const h1 = 1.42;
  const h2 = 1.68;
  const r1 = Math.min(colW, h1) / 2;
  const r2 = Math.min(colW, h2) / 2;

  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: baseX,
    y: yB - h1,
    w: colW,
    h: h1,
    fill: { color: THEME.barMuted },
    line: { type: "none" },
    rectRadius: r1,
  });
  slide.addText("62%", {
    x: baseX,
    y: yB - h1 + 0.06,
    w: colW,
    h: 0.35,
    fontSize: 11,
    fontFace: "Arial",
    color: THEME.secondary,
    align: "center",
    valign: "top",
    margin: 0,
  });

  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: baseX + colW + gap,
    y: yB - h2,
    w: colW,
    h: h2,
    fill: { color: THEME.accent },
    line: { type: "none" },
    rectRadius: r2,
  });
  slide.addText("71%", {
    x: baseX + colW + gap,
    y: yB - h2 + 0.06,
    w: colW,
    h: 0.35,
    fontSize: 12,
    fontFace: "Arial",
    color: "FFFFFF",
    align: "center",
    valign: "top",
    margin: 0,
  });

  slide.addText("Q1", {
    x: baseX,
    y: yB + 0.12,
    w: colW,
    h: 0.3,
    fontSize: 10,
    fontFace: "Arial",
    color: THEME.secondary,
    align: "center",
    margin: 0,
  });
  slide.addText("Q2", {
    x: baseX + colW + gap,
    y: yB + 0.12,
    w: colW,
    h: 0.3,
    fontSize: 10,
    fontFace: "Arial",
    color: THEME.secondary,
    align: "center",
    margin: 0,
  });
  slide.addText(
    "Quarter-over-quarter share of expansion revenue attributed to core accounts",
    {
      x: 6.35,
      y: 4.78,
      w: 3.45,
      h: 0.45,
      fontSize: 9,
      fontFace: "Arial",
      color: THEME.secondary,
      margin: 0,
    }
  );

  slide.addText("March 2026", {
    x: m,
    y: 5.18,
    w: 2.5,
    h: 0.3,
    fontSize: 9,
    fontFace: "Arial",
    color: THEME.secondary,
    margin: 0,
  });
  slide.addText("Quarterly review", {
    x: 7.2,
    y: 5.18,
    w: 2.5,
    h: 0.3,
    fontSize: 9,
    fontFace: "Arial",
    color: THEME.secondary,
    align: "right",
    margin: 0,
  });

  return slide;
}

/* ——— Standalone preview ——— */
if (require.main === module) {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  createSlide(pres);
  pres.writeFile({ fileName: "slide-01-preview.pptx" });
}

module.exports = { createSlide, slideConfig, THEME };
