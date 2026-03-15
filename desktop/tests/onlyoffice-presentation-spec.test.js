const test = require("node:test");
const assert = require("node:assert/strict");

const spec = require("../../shared/onlyoffice-presentation-spec.json");
const {
  buildOnlyOfficePresentationPrompt,
  getOnlyOfficePresentationDescription,
  getOnlyOfficePresentationTools,
} = require("../lib/onlyoffice-presentation-spec");
const { getOnlyOfficeSubagent } = require("../lib/onlyoffice-subagents");

test("desktop presentation helpers mirror the shared presentation spec", () => {
  const helperTools = getOnlyOfficePresentationTools();
  assert.deepEqual(
    helperTools.map((tool) => tool.name),
    spec.tools.map((tool) => tool.name),
  );
  assert.equal(getOnlyOfficePresentationDescription(), spec.agent.description);
  const prompt = buildOnlyOfficePresentationPrompt();
  assert.match(prompt, /## Role/);
  assert.match(prompt, /createFile initializes a starter file template only/i);
  assert.match(prompt, /do not finalize after createFile/i);
  assert.match(prompt, /run verifySlides before finalizing/i);
  assert.match(prompt, /blank\/template presentation/i);
});

test("desktop onlyoffice subagent presentation tools come from the shared spec", () => {
  const presentation = getOnlyOfficeSubagent("presentation");
  assert.ok(presentation);
  assert.deepEqual(
    presentation.tools.map((tool) => tool.name),
    ["createFile", "exportCurrentFile", ...spec.tools.map((tool) => tool.name)],
  );
});
