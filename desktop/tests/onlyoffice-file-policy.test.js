const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SUPPORTED_FORMATS,
  normalizeFormat,
  inferFormatsFromPrompt,
  resolveFormatSelection,
  buildDeterministicFileName,
  resolveUniqueFilePath,
} = require("../lib/onlyoffice-file-policy");

test("normalizeFormat handles known aliases and typo normalization", () => {
  assert.equal(normalizeFormat("xlsv"), "xlsx");
  assert.equal(normalizeFormat(".XLS"), "xlsx");
  assert.equal(normalizeFormat("DOC"), "docx");
  assert.equal(normalizeFormat("ppt"), "pptx");
  assert.equal(normalizeFormat("pdf"), "pdf");
});

test("inferFormatsFromPrompt detects explicit single-format cues", () => {
  assert.deepEqual(inferFormatsFromPrompt("Generate a revenue deck in pptx"), ["pptx"]);
  assert.deepEqual(inferFormatsFromPrompt("create xlsv budget model"), ["xlsx"]);
  assert.deepEqual(inferFormatsFromPrompt("export this as pdf"), ["pdf"]);
});

test("resolveFormatSelection resolves requested format first", () => {
  const result = resolveFormatSelection({
    requestedFormat: "docx",
    prompt: "Generate a report",
    mode: "create",
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.format, "docx");
});

test("resolveFormatSelection normalizes requested xlsv to xlsx", () => {
  const result = resolveFormatSelection({
    requestedFormat: "xlsv",
    prompt: "Create a budget",
    mode: "create",
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.format, "xlsx");
});

test("resolveFormatSelection asks clarification when ambiguous", () => {
  const result = resolveFormatSelection({
    prompt: "Create a docx document and also a slide deck",
    mode: "create",
  });

  assert.equal(result.requiresClarification, true);
  assert.equal(result.status, "ambiguous");
});

test("resolveFormatSelection asks clarification when no clear format", () => {
  const result = resolveFormatSelection({
    prompt: "Create investor memo",
    mode: "create",
  });

  assert.equal(result.requiresClarification, true);
  assert.equal(result.status, "ambiguous");
});

test("buildDeterministicFileName includes slug, timestamp, and extension", () => {
  const fileName = buildDeterministicFileName({
    title: "Investor Memo",
    format: "docx",
    date: new Date("2026-03-09T15:37:27"),
  });

  assert.equal(fileName, "investor-memo-20260309-153727.docx");
});

test("resolveUniqueFilePath appends collision suffix", () => {
  const taken = new Set([
    "C:\\tmp\\report-20260309-153727.docx",
    "C:\\tmp\\report-20260309-153727-2.docx",
  ]);

  const result = resolveUniqueFilePath(
    "C:\\tmp",
    "report-20260309-153727.docx",
    (candidate) => taken.has(candidate),
  );

  assert.equal(result, "C:\\tmp\\report-20260309-153727-3.docx");
});

test("supported format list includes required outputs", () => {
  assert.deepEqual(SUPPORTED_FORMATS, ["xlsx", "docx", "pptx", "pdf"]);
});
