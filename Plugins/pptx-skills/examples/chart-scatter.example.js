const { THEME, box, createDeck, addTitle, addSource, writeDeck, ZONES } = require("./example-lib");

async function build() {
  const pptx = createDeck({ title: "Scatter chart example" });
  const slide = pptx.addSlide();
  addTitle(slide, "landscape", "Higher growth peers still command better multiples", "Scatter chart reference");

  slide.addChart(
    pptx.ChartType.scatter,
    [
      {
        name: "Peers",
        labels: ["A", "B", "C", "D", "E"],
        values: [9, 12, 15, 17, 20],
        xValues: [4, 6, 8, 10, 12],
      },
    ],
    {
      ...box(ZONES.landscape.chart),
      showLegend: false,
      showTitle: false,
      chartColors: ["4c84c4"],
      catAxisLabelFontFace: "Calibri",
      valAxisLabelFontFace: "Calibri",
    },
  );

  addSource(slide, "landscape", "Illustrative peer relationship view");
  await writeDeck(pptx, "chart-scatter-preview.pptx");
}

build();
