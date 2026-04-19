const { THEME, box, createDeck, addTitle, addSource, writeDeck } = require("./example-lib");

async function build() {
  const pptx = createDeck({ title: "Pie chart example" });
  const slide = pptx.addSlide();
  addTitle(slide, "landscape", "Expense mix remained concentrated in three buckets", "Pie chart reference");

  slide.addChart(
    pptx.ChartType.pie,
    [
      {
        name: "Expense mix",
        labels: ["Compensation", "Technology", "Occupancy", "Other"],
        values: [52, 18, 14, 16],
      },
    ],
    {
      ...box({ x: 65, y: 36, w: 124, h: 84 }),
      showLegend: true,
      legendPos: "r",
      showTitle: false,
      showPercent: true,
      showLeaderLines: true,
      chartColors: [THEME.primary, THEME.secondary, THEME.accent, THEME.blueLight],
      legendFontFace: "Calibri",
    },
  );

  addSource(slide, "landscape", "Illustrative operating expense mix");
  await writeDeck(pptx, "chart-pie-preview.pptx");
}

build();
