const { THEME, box, createDeck, addTitle, addSource, writeDeck, ZONES } = require("./example-lib");

async function build() {
  const pptx = createDeck({ title: "Bar chart example" });
  const slide = pptx.addSlide();
  addTitle(slide, "landscape", "Long-label exposures are easier to read as horizontal bars", "Bar chart reference");

  slide.addChart(
    pptx.ChartType.bar,
    [
      {
        name: "Current exposure",
        labels: ["Consumer, Non-cyclical", "Consumer, Cyclical", "Non sector-specific ETF", "Basic Materials", "Communications"],
        values: [15.3, 11.8, 2.1, 4.6, 15.2],
      },
    ],
    {
      ...box({ x: 15, y: 40, w: 224, h: 88 }),
      barDir: "bar",
      showLegend: false,
      showTitle: false,
      showValue: true,
      dataLabelPosition: "outEnd",
      chartColors: [THEME.primary],
      catAxisLabelFontFace: "Calibri",
      valAxisLabelFontFace: "Calibri",
    },
  );

  addSource(slide, "landscape", "Illustrative positioning data");
  await writeDeck(pptx, "chart-bar-preview.pptx");
}

build();
