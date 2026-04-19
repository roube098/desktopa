const test = require("node:test");
const assert = require("node:assert/strict");

const spec = require("../../shared/onlyoffice-presentation-spec.json");
const {
  buildOnlyOfficePresentationPrompt,
  getOnlyOfficePresentationDescription,
  getOnlyOfficePresentationTools,
} = require("../lib/onlyoffice-presentation-spec");

test("desktop presentation helpers mirror the shared presentation spec", () => {
  const helperTools = getOnlyOfficePresentationTools();
  assert.deepEqual(
    helperTools.map((tool) => tool.name),
    spec.tools.map((tool) => tool.name),
  );
  assert.equal(getOnlyOfficePresentationDescription(), spec.agent.description);
  const prompt = buildOnlyOfficePresentationPrompt();
  assert.match(prompt, /## Role/);
  assert.match(prompt, /PptxGenJS/i);
  assert.match(prompt, /There is no live OnlyOffice editor API in this path/i);
  assert.match(prompt, /orientation is set once/i);
  assert.match(prompt, /Landscape decks are 254mm wide x 143mm tall/i);
  assert.match(prompt, /Supported chart types are exactly/i);
  assert.match(prompt, /ALWAYS run `verifySlides`/i);
});
