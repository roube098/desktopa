const { THEME, box, createDeck, addTitle, addSource, writeDeck, ZONES } = require("./example-lib");

async function build() {
  const pptx = createDeck({ title: "Area chart example" });
  const slide = pptx.addSlide();
  addTitle(slide, "landscape", "Recurring revenue base continued to deepen", "Area chart reference");

  slide.addChart(
    pptx.ChartType.area,
    [
      {
        name: "Recurring revenue",
        labels: ["2021", "2022", "2023", "2024", "2025"],
        values: [42, 48, 55, 64, 72],
      },
    ],
    {
      ...box(ZONES.landscape.chart),
      showLegend: false,
      showTitle: false,
      chartColors: ["9eb9d8"],
      catAxisLabelFontFace: "Calibri",
      valAxisLabelFontFace: "Calibri",
    },
  );

  addSource(slide, "landscape", "Illustrative recurring revenue trend");
  await writeDeck(pptx, "chart-area-preview.pptx");
}

build();
