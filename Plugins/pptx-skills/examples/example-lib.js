const path = require("node:path");
const PptxGenJS = require("pptxgenjs");

const THEME = {
  primary: "0c2340",
  secondary: "3d4f66",
  accent: "64748b",
  light: "e8edf0",
  bg: "ffffff",
  blueLight: "9eb9d8",
};

const ZONES = {
  landscape: {
    slide: { w: 254, h: 143 },
    title: { x: 15, y: 8, w: 224, h: 22 },
    subtitle: { x: 15, y: 28, w: 224, h: 8 },
    body: { x: 15, y: 38, w: 224, h: 95 },
    chart: { x: 15, y: 40, w: 224, h: 90 },
    footer: { x: 15, y: 130, w: 224, h: 8 },
  },
  portrait: {
    slide: { w: 143, h: 254 },
    title: { x: 12, y: 10, w: 119, h: 24 },
    subtitle: { x: 12, y: 31, w: 119, h: 8 },
    body: { x: 12, y: 46, w: 119, h: 176 },
    chart: { x: 12, y: 52, w: 119, h: 120 },
    footer: { x: 12, y: 239, w: 119, h: 8 },
  },
};

function mm(value) {
  return value / 25.4;
}

function box(zone) {
  return { x: mm(zone.x), y: mm(zone.y), w: mm(zone.w), h: mm(zone.h) };
}

function createDeck({ orientation = "landscape", title = "Institutional PPTX Example" } = {}) {
  const pptx = new PptxGenJS();
  if (orientation === "portrait") {
    pptx.defineLayout({
      name: "EXCELOR_PORTRAIT_16X9",
      width: mm(ZONES.portrait.slide.w),
      height: mm(ZONES.portrait.slide.h),
    });
    pptx.layout = "EXCELOR_PORTRAIT_16X9";
  } else {
    pptx.layout = "LAYOUT_WIDE";
  }
  pptx.author = "Excelor";
  pptx.company = "Excelor";
  pptx.subject = "Institutional PPTX plugin example";
  pptx.title = title;
  return pptx;
}

function addTitle(slide, orientation, title, subtitle) {
  const zones = ZONES[orientation];
  slide.background = { color: THEME.bg };
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: mm(zones.slide.w),
    h: mm(4),
    fill: { color: THEME.primary },
    line: { color: THEME.primary, width: 0.5 },
  });
  slide.addText(title, {
    ...box(zones.title),
    margin: 0,
    fontFace: "Calibri",
    bold: true,
    fontSize: orientation === "portrait" ? 24 : 26,
    color: THEME.primary,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      ...box(zones.subtitle),
      margin: 0,
      fontFace: "Calibri",
      fontSize: 10,
      color: THEME.accent,
    });
  }
}

function addSource(slide, orientation, sourceText) {
  const zones = ZONES[orientation];
  slide.addText(`Source: ${sourceText}`, {
    ...box(zones.footer),
    margin: 0,
    fontFace: "Calibri",
    fontSize: 9,
    color: THEME.accent,
  });
}

function addBodyText(slide, orientation, text, override = {}) {
  const zone = { ...ZONES[orientation].body, ...override };
  slide.addText(text, {
    ...box(zone),
    margin: 0,
    fontFace: "Calibri",
    fontSize: 14,
    color: THEME.secondary,
    breakLine: false,
    valign: "top",
  });
}

function addTable(slide, orientation, rows, override = {}) {
  const base = orientation === "portrait"
    ? { x: 12, y: 52, w: 119, h: 156 }
    : { x: 15, y: 40, w: 224, h: 82 };
  const zone = { ...base, ...override };
  slide.addTable(rows, {
    ...box(zone),
    margin: 0.04,
    fontFace: "Calibri",
    fontSize: orientation === "portrait" ? 10 : 11,
    color: THEME.secondary,
    border: { type: "solid", color: THEME.light, pt: 0.5 },
    fill: THEME.bg,
    rowH: mm(10),
    bold: false,
    autoFit: false,
    valign: "mid",
    align: "left",
    autoPage: false,
  });
}

function writeDeck(pptx, fileName) {
  return pptx.writeFile({ fileName: path.join(__dirname, fileName) });
}

module.exports = {
  THEME,
  ZONES,
  box,
  createDeck,
  addTitle,
  addSource,
  addBodyText,
  addTable,
  writeDeck,
};
