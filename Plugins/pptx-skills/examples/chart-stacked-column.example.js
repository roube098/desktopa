const { THEME, box, createDeck, addTitle, addSource, writeDeck, ZONES } = require("./example-lib");

async function build() {
  const pptx = createDeck({ title: "Stacked column chart example" });
  const slide = pptx.addSlide();
  addTitle(slide, "landscape", "Firmwide value expanded while the core segment held share", "Stacked column reference");

  slide.addChart(
    pptx.ChartType.bar,
    [
      {
        name: "BWM",
        labels: ["4Q21", "4Q22", "4Q23", "4Q24", "1Q25"],
        values: [1094, 1126, 1078, 1035, 1039],
      },
      {
        name: "Other firmwide",
        labels: ["4Q21", "4Q22", "4Q23", "4Q24", "1Q25"],
        values: [1374, 1254, 1294, 1382, 1391],
      },
    ],
    {
      ...box(ZONES.landscape.chart),
      barDir: "col",
      barGrouping: "stacked",
      showLegend: true,
      legendPos: "t",
      showTitle: false,
      chartColors: [THEME.primary, "3f7ea2"],
      catAxisLabelFontFace: "Calibri",
      valAxisLabelFontFace: "Calibri",
      legendFontFace: "Calibri",
    },
  );

  addSource(slide, "landscape", "Illustrative quarterly segment view");
  await writeDeck(pptx, "chart-stacked-column-preview.pptx");
}

build();
