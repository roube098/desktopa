const fs = require("node:fs");
const path = require("node:path");

const SPEC_PATH = path.resolve(__dirname, "..", "..", "shared", "onlyoffice-presentation-spec.json");
const ONLYOFFICE_PRESENTATION_SPEC = JSON.parse(fs.readFileSync(SPEC_PATH, "utf8").replace(/^\uFEFF/, ""));

function buildOnlyOfficePresentationPrompt() {
  return ONLYOFFICE_PRESENTATION_SPEC.agent.promptSections
    .map((section) => [`## ${section.title}`, ...(section.lines || [])].join("\n"))
    .join("\n\n");
}

function getOnlyOfficePresentationTools() {
  return (ONLYOFFICE_PRESENTATION_SPEC.tools || []).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: (tool.parameters || []).map((parameter) => ({
      name: parameter.name,
      type: parameter.type || "string",
      description: parameter.description,
      required: parameter.required === true,
      items: parameter.items && parameter.items.type ? { type: parameter.items.type } : undefined,
    })),
  }));
}

function getOnlyOfficePresentationSuggestions() {
  return [...(ONLYOFFICE_PRESENTATION_SPEC.agent?.suggestions || [])];
}

function getOnlyOfficePresentationDescription() {
  return ONLYOFFICE_PRESENTATION_SPEC.agent?.description || "";
}

module.exports = {
  ONLYOFFICE_PRESENTATION_SPEC,
  buildOnlyOfficePresentationPrompt,
  getOnlyOfficePresentationTools,
  getOnlyOfficePresentationSuggestions,
  getOnlyOfficePresentationDescription,
};
