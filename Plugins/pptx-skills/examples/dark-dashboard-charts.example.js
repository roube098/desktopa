/**
 * Dashboard chart style (dark **neon** preset). Same capsule / overlap / pie / pill
 * patterns apply to light or brand themes — see agents/dashboard-chart-generator.md.
 * Run: node dark-dashboard-charts.example.js
 */
const pptxgen = require("pptxgenjs");

const DASH = {
  bg: "000000",
  lime: "D4FF4D",
  white: "FFFFFF",
  muted: "9CA3AF",
  rule: "3F3F46",
  pillBg: "27272A",
  pillLine: "52525B",
  barMuted: "374151",
  pieRest: "2A2A2A",
};

function addRuleH(slide, pres, y, x1, x2) {
  slide.addShape(pres.shapes.LINE, {
    x: x1,
    y,
    w: x2 - x1,
    h: 0,
    line: { color: DASH.rule, width: 0.75 },
  });
}

function addRuleV(slide, pres, x, y1, y2) {
  slide.addShape(pres.shapes.LINE, {
    x,
    y: y1,
    w: 0,
    h: y2 - y1,
    line: { color: DASH.rule, width: 0.75 },
  });
}

function addCapsuleBar(slide, pres, opts) {
  const { x, yBottom, w, h, fill, line, label, labelColor, fontSize } = opts;
  const r = Math.min(w, h) / 2;
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x,
    y: yBottom - h,
    w,
    h,
    fill: { color: fill },
    line: line || { type: "none" },
    rectRadius: r,
  });
  if (label) {
    slide.addText(label, {
      x,
      y: yBottom - h + 0.06,
      w,
      h: 0.35,
      fontSize: fontSize || 11,
      fontFace: "Arial",
      color: labelColor,
      align: "center",
      valign: "top",
      margin: 0,
    });
  }
}

/** Overlapping three-layer column group; draw order = back → front. */
function addSteppedGroup(slide, pres, centerX, yBottom, maxH, layers) {
  layers.forEach((L) => {
    const h = maxH * (L.pct / 100);
    const x = centerX - L.w / 2 + L.dx;
    const r = Math.min(L.w, h) / 2;
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x,
      y: yBottom - h,
      w: L.w,
      h,
      fill: { color: L.fill },
      line: { type: "none" },
      rectRadius: r,
    });
    if (L.label) {
      slide.addText(L.label, {
        x,
        y: yBottom - h + 0.05,
        w: L.w,
        h: 0.4,
        fontSize: L.fontSize || 11,
        fontFace: "Arial",
        color: L.labelColor,
        bold: L.bold || false,
        align: "center",
        valign: "top",
        margin: 0,
      });
    }
  });
}

function slideTrendsInAI(pres) {
  const slide = pres.addSlide();
  slide.background = { color: DASH.bg };

  const m = 0.42;
  addRuleH(slide, pres, 0.38, m, 10 - m);
  addRuleH(slide, pres, 5.05, m, 10 - m);
  addRuleV(slide, pres, 3.95, 0.38, 5.0);
  addRuleH(slide, pres, 2.48, m, 10 - m);

  slide.addText("Trends in AI", {
    x: m,
    y: 0.52,
    w: 3.4,
    h: 0.35,
    fontSize: 12,
    fontFace: "Arial",
    color: DASH.lime,
    margin: 0,
  });
  slide.addText(
    "AI has moved from experimentation to mainstream business use across marketing, operations, IT, and other functions — with adoption accelerating year over year.",
    {
      x: m,
      y: 0.92,
      w: 3.45,
      h: 1.35,
      fontSize: 11,
      fontFace: "Georgia",
      color: DASH.white,
      margin: 0,
    }
  );

  slide.addChart(
    pres.charts.PIE,
    [
      {
        name: "Gen AI use",
        labels: ["Regular use", "Other"],
        values: [71, 29],
      },
    ],
    {
      x: m,
      y: 2.62,
      w: 2.35,
      h: 2.05,
      chartArea: { fill: { color: DASH.bg } },
      chartColors: [DASH.lime, DASH.pieRest],
      showLegend: false,
      showPercent: true,
      dataLabelColor: DASH.muted,
    }
  );
  slide.addText("71% regularly use gen AI in at least one business function", {
    x: m,
    y: 4.78,
    w: 3.35,
    h: 0.45,
    fontSize: 9,
    fontFace: "Arial",
    color: DASH.muted,
    margin: 0,
  });

  const pillLabels = [
    "Marketing & sales",
    "Service operations",
    "Product development",
    "Information technology",
  ];
  let py = 2.62;
  pillLabels.forEach((t) => {
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 4.05,
      y: py,
      w: 2.55,
      h: 0.38,
      fill: { color: DASH.pillBg },
      line: { color: DASH.pillLine, width: 0.5 },
      rectRadius: 0.19,
    });
    slide.addText(t, {
      x: 4.15,
      y: py + 0.08,
      w: 2.35,
      h: 0.28,
      fontSize: 10,
      fontFace: "Arial",
      color: DASH.muted,
      align: "center",
      margin: 0,
    });
    py += 0.46;
  });
  slide.addText("Most common use cases", {
    x: 4.05,
    y: 4.78,
    w: 2.7,
    h: 0.35,
    fontSize: 9,
    fontFace: "Arial",
    color: DASH.muted,
    margin: 0,
  });

  const colW = 0.52;
  const gap = 0.42;
  const baseX = 6.55;
  const yB = 4.65;
  addCapsuleBar(slide, pres, {
    x: baseX,
    yBottom: yB,
    w: colW,
    h: 1.55,
    fill: DASH.barMuted,
    label: "72%",
    labelColor: DASH.muted,
    fontSize: 11,
  });
  addCapsuleBar(slide, pres, {
    x: baseX + colW + gap,
    yBottom: yB,
    w: colW,
    h: 1.68,
    fill: DASH.lime,
    label: "78%",
    labelColor: "000000",
    fontSize: 12,
  });
  slide.addText("2024", {
    x: baseX,
    y: yB + 0.12,
    w: colW,
    h: 0.3,
    fontSize: 10,
    fontFace: "Arial",
    color: DASH.muted,
    align: "center",
    margin: 0,
  });
  slide.addText("2025", {
    x: baseX + colW + gap,
    y: yB + 0.12,
    w: colW,
    h: 0.3,
    fontSize: 10,
    fontFace: "Arial",
    color: DASH.muted,
    align: "center",
    margin: 0,
  });
  slide.addText(
    "Organizations that use AI in ≥1 business function from 2024 to 2025",
    {
      x: 6.35,
      y: 4.78,
      w: 3.45,
      h: 0.45,
      fontSize: 9,
      fontFace: "Arial",
      color: DASH.muted,
      margin: 0,
    }
  );

  slide.addText("January 2025", {
    x: m,
    y: 5.18,
    w: 2.5,
    h: 0.3,
    fontSize: 9,
    fontFace: "Arial",
    color: DASH.muted,
    margin: 0,
  });
  slide.addText("The State of AI", {
    x: 7.2,
    y: 5.18,
    w: 2.5,
    h: 0.3,
    fontSize: 9,
    fontFace: "Arial",
    color: DASH.muted,
    align: "right",
    margin: 0,
  });

  return slide;
}

function slideGovernanceBars(pres) {
  const slide = pres.addSlide();
  slide.background = { color: DASH.bg };

  const m = 0.42;
  addRuleH(slide, pres, 0.38, m, 10 - m);
  addRuleH(slide, pres, 5.05, m, 10 - m);

  const yB = 4.05;
  const maxH = 2.35;
  addSteppedGroup(slide, pres, 1.35, yB, maxH, [
    {
      pct: 70,
      w: 0.46,
      dx: -0.14,
      fill: DASH.lime,
      label: "70%",
      labelColor: "000000",
      fontSize: 12,
      bold: true,
    },
    {
      pct: 20,
      w: 0.4,
      dx: 0.02,
      fill: "6B7280",
      label: "20%",
      labelColor: DASH.muted,
    },
    {
      pct: 10,
      w: 0.34,
      dx: 0.14,
      fill: DASH.barMuted,
      label: "10%",
      labelColor: DASH.muted,
    },
  ]);
  slide.addText("Risk & compliance", {
    x: 0.52,
    y: 4.22,
    w: 1.65,
    h: 0.35,
    fontSize: 9,
    fontFace: "Arial",
    color: DASH.muted,
    align: "center",
    margin: 0,
  });

  addSteppedGroup(slide, pres, 3.25, yB, maxH, [
    {
      pct: 65,
      w: 0.46,
      dx: -0.14,
      fill: DASH.lime,
      label: "65%",
      labelColor: "000000",
      fontSize: 12,
      bold: true,
    },
    {
      pct: 25,
      w: 0.4,
      dx: 0.02,
      fill: "6B7280",
      label: "25%",
      labelColor: DASH.muted,
    },
    {
      pct: 10,
      w: 0.34,
      dx: 0.14,
      fill: DASH.barMuted,
      label: "10%",
      labelColor: DASH.muted,
    },
  ]);
  slide.addText("Data governance", {
    x: 2.42,
    y: 4.22,
    w: 1.65,
    h: 0.35,
    fontSize: 9,
    fontFace: "Arial",
    color: DASH.muted,
    align: "center",
    margin: 0,
  });

  slide.addShape(pres.shapes.LINE, {
    x: 0.55,
    y: yB - 2.55,
    w: 0,
    h: 2.55,
    line: { color: DASH.white, width: 1, endArrowType: "triangle" },
  });
  slide.addShape(pres.shapes.LINE, {
    x: 0.55,
    y: yB,
    w: 4.05,
    h: 0,
    line: { color: DASH.white, width: 1, endArrowType: "triangle" },
  });

  slide.addText("Organizational Structures & Governance", {
    x: 5.15,
    y: 0.55,
    w: 4.45,
    h: 0.45,
    fontSize: 14,
    fontFace: "Arial",
    color: DASH.lime,
    margin: 0,
  });
  slide.addText(
    "AI has moved from experimentation to mainstream business use across marketing, operations, IT, and other functions — with adoption accelerating year over year.",
    {
      x: 5.15,
      y: 1.05,
      w: 4.45,
      h: 1.8,
      fontSize: 11,
      fontFace: "Georgia",
      color: DASH.white,
      margin: 0,
    }
  );

  const leg = [
    { fill: DASH.lime, label: "Centralized" },
    { fill: "6B7280", label: "Hybrid" },
    { fill: DASH.barMuted, label: "Decentralized" },
  ];
  let ly = 3.55;
  leg.forEach((row) => {
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 5.15,
      y: ly,
      w: 0.38,
      h: 0.22,
      fill: { color: row.fill },
      line: { type: "none" },
      rectRadius: 0.08,
    });
    slide.addText(row.label, {
      x: 5.62,
      y: ly - 0.02,
      w: 2.5,
      h: 0.28,
      fontSize: 10,
      fontFace: "Arial",
      color: DASH.muted,
      margin: 0,
    });
    ly += 0.36;
  });

  slide.addText("January 2025", {
    x: m,
    y: 5.18,
    w: 2.5,
    h: 0.3,
    fontSize: 9,
    fontFace: "Arial",
    color: DASH.muted,
    margin: 0,
  });
  slide.addText("The State of AI", {
    x: 7.2,
    y: 5.18,
    w: 2.5,
    h: 0.3,
    fontSize: 9,
    fontFace: "Arial",
    color: DASH.muted,
    align: "right",
    margin: 0,
  });

  return slide;
}

if (require.main === module) {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  slideTrendsInAI(pres);
  slideGovernanceBars(pres);
  pres.writeFile({ fileName: "dark-dashboard-charts-preview.pptx" });
}

module.exports = { slideTrendsInAI, slideGovernanceBars, DASH };
