const { THEME, box, createDeck, addTitle, addSource, writeDeck } = require("./example-lib");

async function build() {
  const pptx = createDeck({ title: "Growth story visual example" });
  const slide = pptx.addSlide();
  addTitle(slide, "landscape", "AI / ML initiatives could materially expand value over time", "Growth-story reference");

  slide.addChart(
    pptx.ChartType.bar,
    [
      {
        name: "Cost and risk efficiencies",
        labels: ["2023", "2024", "2025 outlook"],
        values: [18, 23, 34],
      },
      {
        name: "Revenue generation",
        labels: ["2023", "2024", "2025 outlook"],
        values: [10, 12, 20],
      },
    ],
    {
      ...box({ x: 20, y: 46, w: 150, h: 78 }),
      barDir: "col",
      barGrouping: "stacked",
      showLegend: true,
      legendPos: "l",
      showTitle: false,
      chartColors: [THEME.primary, THEME.blueLight],
      legendFontFace: "Calibri",
      catAxisLabelFontFace: "Calibri",
      valAxisLabelFontFace: "Calibri",
    },
  );

  slide.addShape("rightArrow", {
    x: 6.0,
    y: 0.95,
    w: 2.9,
    h: 0.5,
    fill: { color: THEME.accent, transparency: 12 },
    line: { color: THEME.accent, width: 0.5 },
    rotate: 335,
  });
  [["35%", 4.2, 2.0], ["65%", 6.45, 1.2]].forEach(([label, x, y]) => {
    slide.addShape("ellipse", {
      x,
      y,
      w: 0.8,
      h: 0.28,
      fill: { color: "ffffff" },
      line: { color: THEME.light, width: 0.8 },
    });
    slide.addText(label, {
      x,
      y: y + 0.03,
      w: 0.8,
      h: 0.18,
      align: "center",
      margin: 0,
      fontFace: "Calibri",
      bold: true,
      fontSize: 10,
      color: THEME.primary,
    });
  });

  addSource(slide, "landscape", "Illustrative strategic initiative outlook");
  await writeDeck(pptx, "visual-growth-story-preview.pptx");
}

build();
