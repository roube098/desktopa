const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { getSkillSources } = require("../lib/skills-manager");

test("getSkillSources includes workspace plugin skills", () => {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const sources = getSkillSources(repoRoot);
  const pluginSource = sources.find((entry) => entry.pluginName === "pptx-skills");

  assert.ok(pluginSource);
  assert.equal(pluginSource.source, "official");
  assert.ok(String(pluginSource.path || "").endsWith(path.join("pptx-skills", "skills")));
});
