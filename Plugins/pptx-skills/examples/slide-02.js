/**
 * Dashboard chart — dark neon (dual stepped column groups + L-axis + legend swatches).
 * Run: node slide-02.js  →  slide-02-preview.pptx
 */
const pptxgen = require("pptxgenjs");

const slideConfig = {
  type: "dashboard-chart",
  themeMode: "dark-neon",
  variant: "governance-bars",
  index: 2,
  seriesTitle: "Quarterly review",
  footerDate: "March 2026",
};

const THEME = {
  bg: "000000",
  primary: "FFFFFF",
  secondary: "9CA3AF",
  accent: "D4FF4D",
  light: "3F3F46",
  barMid: "6B7280",
  barBack: "374151",
};

/**
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
    y: 5.05,
    w: 10 - 2 * m,
    h: 0,
    line: { color: THEME.light, width: 0.75 },
  });
  slide.addShape(pres.shapes.LINE, {
    x: m,
    y: 4.92,
    w: 10 - 2 * m,
    h: 0,
    line: { color: THEME.light, width: 0.5 },
  });

  const yB = 4.05;
  const maxH = 2.35;

  [
    {
      cx: 1.35,
      layers: [
        {
          pct: 55,
          w: 0.46,
          dx: -0.14,
          fill: THEME.accent,
          label: "55%",
          labelColor: "000000",
          fontSize: 12,
          bold: true,
        },
        {
          pct: 30,
          w: 0.4,
          dx: 0.02,
          fill: THEME.barMid,
          label: "30%",
          labelColor: THEME.secondary,
          fontSize: 11,
          bold: false,
        },
        {
          pct: 15,
          w: 0.34,
          dx: 0.14,
          fill: THEME.barBack,
          label: "15%",
          labelColor: THEME.secondary,
          fontSize: 11,
          bold: false,
        },
      ],
      caption: "Cohort A",
    },
    {
      cx: 3.25,
      layers: [
        {
          pct: 48,
          w: 0.46,
          dx: -0.14,
          fill: THEME.accent,
          label: "48%",
          labelColor: "000000",
          fontSize: 12,
          bold: true,
        },
        {
          pct: 35,
          w: 0.4,
          dx: 0.02,
          fill: THEME.barMid,
          label: "35%",
          labelColor: THEME.secondary,
          fontSize: 11,
          bold: false,
        },
        {
          pct: 17,
          w: 0.34,
          dx: 0.14,
          fill: THEME.barBack,
          label: "17%",
          labelColor: THEME.secondary,
          fontSize: 11,
          bold: false,
        },
      ],
      caption: "Cohort B",
    },
  ].forEach((group) => {
    group.layers.forEach((L) => {
      const h = maxH * (L.pct / 100);
      const x = group.cx - L.w / 2 + L.dx;
      const r = Math.min(L.w, h) / 2;
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x,
        y: yB - h,
        w: L.w,
        h,
        fill: { color: L.fill },
        line: { type: "none" },
        rectRadius: r,
      });
      slide.addText(L.label, {
        x,
        y: yB - h + 0.05,
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
    });
    slide.addText(group.caption, {
      x: group.cx - 0.82,
      y: 4.22,
      w: 1.65,
      h: 0.35,
      fontSize: 9,
      fontFace: "Arial",
      color: THEME.secondary,
      align: "center",
      margin: 0,
    });
  });

  slide.addShape(pres.shapes.LINE, {
    x: 0.55,
    y: yB - 2.55,
    w: 0,
    h: 2.55,
    line: { color: THEME.primary, width: 1, endArrowType: "triangle" },
  });
  slide.addShape(pres.shapes.LINE, {
    x: 0.55,
    y: yB,
    w: 4.05,
    h: 0,
    line: { color: THEME.primary, width: 1, endArrowType: "triangle" },
  });

  slide.addText("Segment mix", {
    x: 5.15,
    y: 0.55,
    w: 4.45,
    h: 0.45,
    fontSize: 14,
    fontFace: "Arial",
    color: THEME.accent,
    margin: 0,
  });
  slide.addText(
    "Two cohorts show how the stack compresses when the lead wedge stays dominant: secondary and tertiary bands narrow while the headline share holds most of the column height.",
    {
      x: 5.15,
      y: 1.05,
      w: 4.45,
      h: 1.8,
      fontSize: 11,
      fontFace: "Georgia",
      color: THEME.primary,
      margin: 0,
    }
  );

  const leg = [
    { fill: THEME.accent, label: "Primary" },
    { fill: THEME.barMid, label: "Secondary" },
    { fill: THEME.barBack, label: "Tertiary" },
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
      color: THEME.secondary,
      margin: 0,
    });
    ly += 0.36;
  });

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
  pres.writeFile({ fileName: "slide-02-preview.pptx" });
}

module.exports = { createSlide, slideConfig, THEME };
