const { THEME, createDeck, addTitle, addSource, addBodyText, writeDeck } = require("./example-lib");

async function build() {
  const pptx = createDeck({
    orientation: "landscape",
    title: "Institutional landscape example",
  });

  const cover = pptx.addSlide();
  addTitle(cover, "landscape", "Institutional Landscape Deck", "Wide-format institutional reference");
  addBodyText(
    cover,
    "landscape",
    [
      "Use this example as the wide-format baseline.",
      "Calibri only; white / navy / slate only.",
      "Keep one conclusion-led title and one primary message per slide.",
    ].join("\n"),
    { x: 15, y: 48, w: 110, h: 48 },
  );
  cover.addShape("rect", {
    x: 5.4,
    y: 1.5,
    w: 3.7,
    h: 2.2,
    fill: { color: THEME.light, transparency: 12 },
    line: { color: THEME.light, width: 0.8 },
  });
  cover.addText("Agenda", {
    x: 5.65,
    y: 1.72,
    w: 1.5,
    h: 0.22,
    margin: 0,
    fontFace: "Calibri",
    bold: true,
    fontSize: 12,
    color: THEME.primary,
  });
  cover.addText("1. Thesis\n2. Evidence\n3. Recommendation", {
    x: 5.65,
    y: 2.02,
    w: 2.6,
    h: 1.1,
    margin: 0,
    fontFace: "Calibri",
    fontSize: 12,
    color: THEME.secondary,
  });
  addSource(cover, "landscape", "Excelor plugin example, April 2026");

  const summary = pptx.addSlide();
  addTitle(summary, "landscape", "Margins expanded while recurring mix improved", "Landscape summary slide");
  addBodyText(
    summary,
    "landscape",
    [
      "Revenue up 14% YoY.",
      "Recurring revenue mix reached 71%.",
      "Adjusted EBITDA margin expanded 180 bps.",
      "Management reiterated FY targets.",
    ].join("\n"),
    { x: 15, y: 44, w: 92, h: 70 },
  );
  summary.addShape("rect", {
    x: 4.6,
    y: 1.7,
    w: 4.6,
    h: 1.85,
    fill: { color: THEME.bg },
    line: { color: THEME.light, width: 0.8 },
  });
  summary.addText("Selected KPIs", {
    x: 4.82,
    y: 1.92,
    w: 1.8,
    h: 0.24,
    margin: 0,
    fontFace: "Calibri",
    bold: true,
    fontSize: 12,
    color: THEME.primary,
  });
  [["Revenue", "$128m"], ["Recurring mix", "71%"], ["Adj. EBITDA", "24.6%"]].forEach(([label, value], index) => {
    const y = 2.35 + index * 0.42;
    summary.addText(label, {
      x: 4.82,
      y,
      w: 1.6,
      h: 0.18,
      margin: 0,
      fontFace: "Calibri",
      fontSize: 10,
      color: THEME.accent,
    });
    summary.addText(value, {
      x: 6.45,
      y: y - 0.03,
      w: 1.8,
      h: 0.24,
      margin: 0,
      fontFace: "Calibri",
      bold: true,
      fontSize: 14,
      color: THEME.primary,
    });
  });
  addSource(summary, "landscape", "Company materials, April 2026");

  await writeDeck(pptx, "institutional-landscape-preview.pptx");
}

build();
