const { THEME, box, createDeck, addTitle, addSource, writeDeck, ZONES } = require("./example-lib");

async function build() {
  const pptx = createDeck({ title: "Line chart example" });
  const slide = pptx.addSlide();
  addTitle(slide, "landscape", "Leverage spread deteriorated sharply into mid-2013", "Line chart reference");

  slide.addChart(
    pptx.ChartType.line,
    [
      {
        name: "Difference",
        labels: ["Nov-11", "Feb-12", "May-12", "Aug-12", "Nov-12", "Feb-13", "May-13", "Aug-13"],
        values: [-0.6, -0.1, -0.3, 0.05, -0.15, 0.12, -0.45, -1.6],
      },
    ],
    {
      ...box(ZONES.landscape.chart),
      showLegend: true,
      legendPos: "b",
      showTitle: false,
      chartColors: ["4c84c4"],
      catAxisLabelFontFace: "Calibri",
      valAxisLabelFontFace: "Calibri",
      legendFontFace: "Calibri",
      lineSize: 2.5,
      valAxisMinVal: -2,
      valAxisMaxVal: 0.5,
      valAxisMajorUnit: 0.5,
    },
  );

  addSource(slide, "landscape", "Illustrative factor time series");
  await writeDeck(pptx, "chart-line-preview.pptx");
}

build();
