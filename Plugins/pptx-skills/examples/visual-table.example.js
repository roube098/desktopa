const { createDeck, addTitle, addSource, addTable, writeDeck } = require("./example-lib");

async function build() {
  const pptx = createDeck({ title: "Table visual example" });
  const slide = pptx.addSlide();
  addTitle(slide, "landscape", "Long and short exposures remained stable into October", "Table reference");

  addTable(slide, "landscape", [
    [{ text: "Sector" }, { text: "Long Oct-12" }, { text: "Long Sep-13" }, { text: "Long Oct-13" }, { text: "Short Oct-12" }, { text: "Short Sep-13" }, { text: "Short Oct-13" }],
    ["Basic Materials", "5.0%", "4.6%", "4.6%", "5.1%", "5.0%", "4.6%"],
    ["Communications", "12.7%", "15.0%", "15.2%", "7.2%", "6.3%", "6.2%"],
    ["Consumer, Cyclical", "10.5%", "11.6%", "11.8%", "9.0%", "8.2%", "7.7%"],
    ["Financial", "20.0%", "16.7%", "16.8%", "11.2%", "8.6%", "8.2%"],
    ["Technology", "4.7%", "5.0%", "4.8%", "6.6%", "7.2%", "6.6%"],
    ["Utilities", "1.5%", "1.3%", "1.4%", "1.6%", "1.5%", "1.6%"]
  ]);

  addSource(slide, "landscape", "J.P. Morgan Prime Brokerage");
  await writeDeck(pptx, "visual-table-preview.pptx");
}

build();
