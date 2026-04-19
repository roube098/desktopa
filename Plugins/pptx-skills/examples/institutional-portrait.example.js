const { THEME, createDeck, addTitle, addSource, addBodyText, writeDeck } = require("./example-lib");

async function build() {
  const pptx = createDeck({
    orientation: "portrait",
    title: "Institutional portrait example",
  });

  const slide = pptx.addSlide();
  addTitle(slide, "portrait", "Portrait Briefing Deck", "Tall-format institutional reference");
  addBodyText(
    slide,
    "portrait",
    [
      "Use portrait as a stacked briefing format.",
      "Keep one visual or one compact table per slide.",
      "Split landscape density across multiple portrait slides.",
    ].join("\n"),
    { x: 12, y: 50, w: 119, h: 44 },
  );
  slide.addShape("rect", {
    x: 0.47,
    y: 4.1,
    w: 4.68,
    h: 2.25,
    fill: { color: THEME.bg },
    line: { color: THEME.light, width: 0.8 },
  });
  slide.addText("Portrait-safe structure", {
    x: 0.68,
    y: 4.33,
    w: 2.4,
    h: 0.2,
    margin: 0,
    fontFace: "Calibri",
    bold: true,
    fontSize: 12,
    color: THEME.primary,
  });
  addBodyText(
    slide,
    "portrait",
    "Upper zone for the primary message.\nLower zone for one compact visual.\nFooter reserved for source or note.",
    { x: 17, y: 121, w: 108, h: 55 },
  );
  addSource(slide, "portrait", "Excelor plugin example, April 2026");

  await writeDeck(pptx, "institutional-portrait-preview.pptx");
}

build();
