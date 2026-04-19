const { THEME, box, createDeck, addTitle, addSource, writeDeck, ZONES } = require("./example-lib");

async function build() {
  const pptx = createDeck({ title: "Column chart example" });
  const slide = pptx.addSlide();
  addTitle(slide, "landscape", "Sector performance remained concentrated in a few leaders", "Column chart reference");

  slide.addChart(
    pptx.ChartType.bar,
    [
      {
        name: "Performance",
        labels: ["Telecom", "Cons. Staples", "Industrials", "Cons. Discr.", "Tech", "Healthcare", "Materials", "Energy", "Utilities", "Financials"],
        values: [7.35, 6.13, 5.05, 4.6, 4.5, 4.2, 4.11, 4.07, 3.66, 3.15],
      },
    ],
    {
      ...box(ZONES.landscape.chart),
      barDir: "col",
      showLegend: false,
      showTitle: false,
      showValue: true,
      dataLabelPosition: "outEnd",
      catAxisLabelRotate: 315,
      chartColors: [THEME.primary],
      catAxisLabelFontFace: "Calibri",
      valAxisLabelFontFace: "Calibri",
      valAxisMinVal: -1,
      valAxisMaxVal: 8,
      valAxisMajorUnit: 1,
    },
  );

  addSource(slide, "landscape", "Bloomberg, Standard & Poor's");
  await writeDeck(pptx, "chart-column-preview.pptx");
}

build();
