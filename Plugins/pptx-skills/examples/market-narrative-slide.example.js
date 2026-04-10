/**
 * Reference implementation: market headline + adoption S-curve + four-column footer.
 * Requires: npm install pptxgenjs
 * Run: node market-narrative-slide.example.js
 */
const pptxgen = require("pptxgenjs");

/** English UI sans — matches plugin default (install Inter, or use Segoe UI if missing). */
const FONT_EN = "Inter";

const slideConfig = {
  type: "market-narrative",
  index: 1,
  headline: "$52B market.",
  subtitle: "No execution-layer winner yet.",
  curve: {
    currentLabel: "We are here",
    futureLabel: "Autonomous agents emerge",
    currentT: 0.28,
    futureT: 0.72,
  },
  footer: {
    columns: [
      {
        kind: "text",
        text:
          "The autonomous execution layer has no clear winner yet. Excelor offers local-first, finance-ready positioning for teams that need governed, on-premise or air-gapped execution.",
      },
      {
        kind: "stat",
        stat: "$7.8B in 2025",
        caption: "Spend still skewed to chat interfaces and copilots",
      },
      {
        kind: "stat",
        stat: "46% CAGR overall",
        caption: "Vertical agents fastest at 62.7% CAGR",
      },
      {
        kind: "stat",
        stat: "$52.6B by 2030",
        caption: "Finance vertical leads enterprise adoption",
      },
    ],
  },
};

function buildSigmoidPolyline(pathW, pathH, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = t * pathW;
    const logistic = 1 / (1 + Math.exp(-11 * (t - 0.5)));
    const y = pathH * (0.06 + (1 - logistic) * 0.88);
    pts.push(i === 0 ? { x, y, moveTo: true } : { x, y });
  }
  return pts;
}

function pointOnSigmoid(t, pathW, pathH) {
  const logistic = 1 / (1 + Math.exp(-11 * (t - 0.5)));
  const y = pathH * (0.06 + (1 - logistic) * 0.88);
  return { x: t * pathW, y };
}

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };

  const margin = 0.52;
  slide.addText(slideConfig.headline, {
    x: margin,
    y: 0.42,
    w: 5.2,
    h: 0.75,
    fontSize: 40,
    fontFace: FONT_EN,
    color: theme.primary,
    bold: true,
    margin: 0,
  });
  slide.addText(slideConfig.subtitle, {
    x: margin,
    y: 1.05,
    w: 5.5,
    h: 0.45,
    fontSize: 17,
    fontFace: FONT_EN,
    color: theme.secondary,
    margin: 0,
  });

  const gx = 4.35;
  const gy = 1.0;
  const gw = 5.15;
  const gh = 2.78;

  slide.addShape(pres.shapes.CUSTOM_GEOMETRY, {
    x: gx,
    y: gy,
    w: gw,
    h: gh,
    fill: { type: "none" },
    line: { color: theme.light, width: 1.25 },
    points: buildSigmoidPolyline(gw, gh, 40),
  });

  const rSolid = 0.065;
  const rRing = 0.07;
  const cur = pointOnSigmoid(slideConfig.curve.currentT, gw, gh);
  const fut = pointOnSigmoid(slideConfig.curve.futureT, gw, gh);

  const curCx = gx + cur.x;
  const curCy = gy + cur.y;
  const futCx = gx + fut.x;
  const futCy = gy + fut.y;

  slide.addShape(pres.shapes.LINE, {
    x: curCx,
    y: curCy + rSolid,
    w: 0,
    h: Math.max(0, 4.05 - (curCy + rSolid)),
    line: { color: theme.light, width: 0.5 },
  });
  slide.addShape(pres.shapes.LINE, {
    x: futCx,
    y: futCy + rRing,
    w: 0,
    h: Math.max(0, 4.05 - (futCy + rRing)),
    line: { color: theme.light, width: 0.5 },
  });

  slide.addText(slideConfig.curve.currentLabel, {
    x: curCx - 0.55,
    y: curCy - 0.42,
    w: 1.2,
    h: 0.28,
    fontSize: 9,
    fontFace: FONT_EN,
    color: theme.secondary,
    align: "center",
    margin: 0,
  });

  slide.addShape(pres.shapes.OVAL, {
    x: curCx - rSolid,
    y: curCy - rSolid,
    w: 2 * rSolid,
    h: 2 * rSolid,
    fill: { color: theme.accent },
    line: { type: "none" },
  });

  slide.addShape(pres.shapes.OVAL, {
    x: futCx - rRing,
    y: futCy - rRing,
    w: 2 * rRing,
    h: 2 * rRing,
    fill: { type: "none" },
    line: { color: theme.secondary, width: 1.25 },
  });
  slide.addText(slideConfig.curve.futureLabel, {
    x: futCx - 0.85,
    y: futCy + rRing + 0.06,
    w: 1.7,
    h: 0.35,
    fontSize: 9,
    fontFace: FONT_EN,
    color: theme.secondary,
    align: "center",
    margin: 0,
  });

  const footerY = 4.12;
  const footerH = 1.05;
  const gap = 0.14;
  const colW = (10 - 2 * margin - 3 * gap) / 4;
  let x = margin;
  const cols = slideConfig.footer.columns;

  slide.addText(cols[0].text, {
    x,
    y: footerY,
    w: colW,
    h: footerH,
    fontSize: 10,
    fontFace: FONT_EN,
    color: theme.secondary,
    margin: 0,
  });
  x += colW + gap;

  for (let i = 1; i < 4; i++) {
    const c = cols[i];
    slide.addText(
      [
        { text: c.stat, options: { breakLine: true, bold: true, fontSize: 13, color: theme.primary } },
        { text: c.caption, options: { fontSize: 10, color: theme.secondary } },
      ],
      { x, y: footerY, w: colW, h: footerH, fontFace: FONT_EN, margin: 0, valign: "top" }
    );
    x += colW + gap;
  }

  const badge = String(slideConfig.index);
  slide.addShape(pres.shapes.OVAL, {
    x: 9.3,
    y: 5.1,
    w: 0.4,
    h: 0.4,
    fill: { color: theme.primary },
  });
  slide.addText(badge, {
    x: 9.3,
    y: 5.1,
    w: 0.4,
    h: 0.4,
    fontSize: 12,
    fontFace: FONT_EN,
    color: "FFFFFF",
    bold: true,
    align: "center",
    valign: "middle",
  });

  return slide;
}

if (require.main === module) {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  const theme = {
    primary: "000000",
    secondary: "666666",
    accent: "E85D04",
    light: "CCCCCC",
    bg: "FFFFFF",
  };
  createSlide(pres, theme);
  pres.writeFile({ fileName: "market-narrative-slide-preview.pptx" });
}

module.exports = { createSlide, slideConfig };
