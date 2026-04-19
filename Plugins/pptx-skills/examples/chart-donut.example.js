const { THEME, box, createDeck, addTitle, addSource, writeDeck } = require("./example-lib");

async function build() {
  const pptx = createDeck({ title: "Donut chart example" });
  const slide = pptx.addSlide();
  addTitle(slide, "landscape", "Revenue mix remained led by subscription streams", "Donut chart reference");

  slide.addChart(
    pptx.ChartType.doughnut,
    [
      {
        name: "Revenue mix",
        labels: ["Subscription", "Services", "Hardware", "Other"],
        values: [61, 21, 12, 6],
      },
    ],
    {
      ...box({ x: 65, y: 36, w: 124, h: 84 }),
      holeSize: 55,
      showLegend: true,
      legendPos: "r",
      showTitle: false,
      showPercent: true,
      showLeaderLines: true,
      chartColors: [THEME.primary, THEME.secondary, THEME.accent, THEME.blueLight],
      legendFontFace: "Calibri",
    },
  );

  addSource(slide, "landscape", "Illustrative revenue mix");
  await writeDeck(pptx, "chart-donut-preview.pptx");
}

build();
