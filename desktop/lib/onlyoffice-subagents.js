const {
  buildOnlyOfficePresentationPrompt,
  getOnlyOfficePresentationDescription,
  getOnlyOfficePresentationTools,
} = require("./onlyoffice-presentation-spec");

const GENERATION_TOOLS = [
  {
    name: "createFile",
    description: "Create a new file in My Workspace. Auto-select format from explicit prompt cues, or ask when ambiguous.",
    parameters: [
      { name: "format", type: "string", description: "xlsx, docx, pptx, or pdf (xlsv normalizes to xlsx)." },
      { name: "title", type: "string", description: "Output title used for deterministic file naming." },
      { name: "prompt", type: "string", description: "Original user request text for hybrid format selection." },
      { name: "open", type: "boolean", description: "Open generated file in OnlyOffice after creation (default true)." },
    ],
  },
  {
    name: "exportCurrentFile",
    description: "Export the currently open file to PDF in My Workspace.",
    parameters: [
      { name: "targetFormat", type: "string", description: "Target format (currently pdf)." },
      { name: "title", type: "string", description: "Optional output title for deterministic file naming." },
      { name: "prompt", type: "string", description: "Original user request text for intent/format checks." },
      { name: "fileName", type: "string", description: "Optional source file name override." },
      { name: "open", type: "boolean", description: "Open exported file after export (default false)." },
    ],
  },
];

const ONLYOFFICE_SUBAGENTS = [
  {
    id: "spreadsheet",
    name: "Spreadsheet Specialist",
    contextType: "spreadsheet",
    description: "Handles spreadsheet formulas, formatting, structures, validation, and chart changes in OnlyOffice.",
    systemPrompt: `You are Excelor's Spreadsheet Specialist for OnlyOffice spreadsheets.
You help users build, edit, format, and analyze spreadsheet data with tool calls.

Rules:
- Create and update sheets step by step.
- Keep formulas explicit and valid.
- When writing cell blocks, make rectangular 2D arrays.
- Validate after major writes when possible.
- For explicit generation requests (create/generate/new file/export as), use createFile/exportCurrentFile.
- Hybrid format policy: auto-select format when explicit, ask when ambiguous.
- Treat "xlsv" as "xlsx".
- Be concise in your final summary.`,
    tools: [
      {
        name: "setCellValue",
        description: "Set the value of a single spreadsheet cell.",
        parameters: [
          { name: "cell", type: "string", description: "Cell reference like A1.", required: true },
          { name: "value", type: "string", description: "Value to write into the cell.", required: true },
        ],
      },
      {
        name: "writeCells",
        description: "Write a rectangular 2D array of values and formulas to a range.",
        parameters: [
          { name: "sheet", type: "string", description: "Target sheet name.", required: true },
          { name: "range", type: "string", description: "Target range like B2:F10.", required: true },
          { name: "values", type: "array", description: "Rectangular 2D array of values.", required: true },
        ],
      },
      {
        name: "setCellFormula",
        description: "Set a formula in a single spreadsheet cell.",
        parameters: [
          { name: "cell", type: "string", description: "Cell reference like B4.", required: true },
          { name: "formula", type: "string", description: "Formula string beginning with =.", required: true },
        ],
      },
      {
        name: "formatCells",
        description: "Apply formatting to one contiguous spreadsheet range.",
        parameters: [
          { name: "range", type: "string", description: "Single contiguous range.", required: true },
          { name: "bold", type: "boolean", description: "Whether the text should be bold." },
          { name: "italic", type: "boolean", description: "Whether the text should be italic." },
          { name: "fontSize", type: "number", description: "Font size in points." },
          { name: "fontColor", type: "string", description: "Font color hex value." },
          { name: "bgColor", type: "string", description: "Background color hex value." },
          { name: "numberFormat", type: "string", description: "Number format string." },
          { name: "horizontalAlignment", type: "string", description: "left, center, or right." },
          { name: "borders", type: "string", description: "all, bottom, top, or outline." },
        ],
      },
      {
        name: "insertRowsColumns",
        description: "Insert rows or columns in the spreadsheet.",
        parameters: [
          { name: "type", type: "string", description: "row or column.", required: true },
          { name: "index", type: "number", description: "Zero-based insert index.", required: true },
          { name: "count", type: "number", description: "Number to insert.", required: true },
        ],
      },
      {
        name: "deleteRowsColumns",
        description: "Delete rows or columns in the spreadsheet.",
        parameters: [
          { name: "type", type: "string", description: "row or column.", required: true },
          { name: "index", type: "number", description: "Zero-based start index.", required: true },
          { name: "count", type: "number", description: "Number to delete.", required: true },
        ],
      },
      {
        name: "createChart",
        description: "Create a chart from spreadsheet data.",
        parameters: [
          { name: "dataRange", type: "string", description: "Data range for the chart.", required: true },
          { name: "chartType", type: "string", description: "Chart type.", required: true },
          { name: "title", type: "string", description: "Chart title." },
          { name: "position", type: "string", description: "Placement cell like G2." },
        ],
      },
      {
        name: "createSheet",
        description: "Create a new worksheet in the spreadsheet.",
        parameters: [
          { name: "name", type: "string", description: "Worksheet name.", required: true },
          { name: "activate", type: "boolean", description: "Whether to activate the sheet." },
        ],
      },
      {
        name: "readSheet",
        description: "Read sheet content for validation or debugging.",
        parameters: [
          { name: "sheet", type: "string", description: "Worksheet name.", required: true },
          { name: "previewType", type: "string", description: "values or formulas." },
        ],
      },
    ],
  },
  {
    id: "document",
    name: "Document Specialist",
    contextType: "document",
    description: "Handles document text, formatting, tables, and structure in OnlyOffice.",
    systemPrompt: `You are Excelor's Document Specialist for OnlyOffice documents.
Use the provided tools to edit or structure the document directly.
For explicit generation requests (create/generate/new file/export as), use createFile/exportCurrentFile.
Use hybrid format selection: auto-select when explicit, ask when ambiguous.
Keep summaries short.`,
    tools: [
      {
        name: "insertText",
        description: "Insert text into the document.",
        parameters: [
          { name: "text", type: "string", description: "Text to insert.", required: true },
          { name: "position", type: "string", description: "cursor, start, or end." },
        ],
      },
      {
        name: "formatText",
        description: "Format currently selected text or a target range.",
        parameters: [
          { name: "bold", type: "boolean", description: "Set bold." },
          { name: "italic", type: "boolean", description: "Set italic." },
          { name: "underline", type: "boolean", description: "Set underline." },
          { name: "fontSize", type: "number", description: "Font size in points." },
          { name: "fontColor", type: "string", description: "Font color hex value." },
          { name: "fontFamily", type: "string", description: "Font family name." },
          { name: "heading", type: "string", description: "Heading level or normal." },
        ],
      },
      {
        name: "insertTable",
        description: "Insert a table into the document.",
        parameters: [
          { name: "rows", type: "number", description: "Row count.", required: true },
          { name: "cols", type: "number", description: "Column count.", required: true },
          { name: "data", type: "array", description: "Optional 2D cell data." },
        ],
      },
      {
        name: "findAndReplace",
        description: "Find and replace document text.",
        parameters: [
          { name: "find", type: "string", description: "Text to find.", required: true },
          { name: "replace", type: "string", description: "Replacement text.", required: true },
          { name: "matchCase", type: "boolean", description: "Case-sensitive match." },
          { name: "replaceAll", type: "boolean", description: "Replace all occurrences." },
        ],
      },
      {
        name: "insertList",
        description: "Insert a bulleted or numbered list.",
        parameters: [
          { name: "type", type: "string", description: "bullet or numbered.", required: true },
          { name: "items", type: "array", description: "List item strings.", required: true },
        ],
      },
      {
        name: "insertPageBreak",
        description: "Insert a page break at the current location.",
        parameters: [],
      },
    ],
  },
  {
    id: "presentation",
    name: "Presentation Specialist",
    contextType: "presentation",
    description: getOnlyOfficePresentationDescription(),
    systemPrompt: buildOnlyOfficePresentationPrompt(),
    tools: getOnlyOfficePresentationTools(),
  },
  {
    id: "pdf",
    name: "PDF Specialist",
    contextType: "pdf",
    description: "Handles annotations, highlights, summaries, and extraction in OnlyOffice PDF files.",
    systemPrompt: `You are Excelor's PDF Specialist for OnlyOffice PDFs.
Use PDF tools directly.
For explicit generation requests (create/generate/new file/export as), use createFile/exportCurrentFile.
Use hybrid format selection: auto-select when explicit, ask when ambiguous.
Keep results concise.`,
    tools: [
      {
        name: "addAnnotation",
        description: "Add an annotation to the PDF.",
        parameters: [
          { name: "page", type: "number", description: "One-based page number.", required: true },
          { name: "text", type: "string", description: "Annotation text.", required: true },
          { name: "x", type: "number", description: "Normalized X position." },
          { name: "y", type: "number", description: "Normalized Y position." },
          { name: "type", type: "string", description: "comment, highlight, or note." },
        ],
      },
      {
        name: "highlightText",
        description: "Highlight text in the PDF.",
        parameters: [
          { name: "page", type: "number", description: "One-based page number.", required: true },
          { name: "text", type: "string", description: "Text to highlight.", required: true },
          { name: "color", type: "string", description: "Highlight color." },
        ],
      },
      {
        name: "extractText",
        description: "Extract PDF text from one or more pages.",
        parameters: [
          { name: "startPage", type: "number", description: "One-based start page.", required: true },
          { name: "endPage", type: "number", description: "One-based end page." },
        ],
      },
      {
        name: "addStamp",
        description: "Add a text stamp to the PDF.",
        parameters: [
          { name: "page", type: "number", description: "One-based page number.", required: true },
          { name: "text", type: "string", description: "Stamp text.", required: true },
          { name: "color", type: "string", description: "Stamp color." },
        ],
      },
      {
        name: "summarizePage",
        description: "Summarize a page or page range in the PDF.",
        parameters: [
          { name: "startPage", type: "number", description: "One-based start page.", required: true },
          { name: "endPage", type: "number", description: "One-based end page." },
        ],
      },
    ],
  },
];

function cloneSubagents() {
  return ONLYOFFICE_SUBAGENTS.map((agent) => ({
    ...agent,
    tools: [...GENERATION_TOOLS, ...(agent.tools || [])].map((tool) => ({
      ...tool,
      parameters: (tool.parameters || []).map((param) => ({ ...param })),
    })),
  }));
}

function getOnlyOfficeSubagents() {
  return cloneSubagents();
}

function getOnlyOfficeSubagent(agentId) {
  return cloneSubagents().find((agent) => agent.id === agentId) || null;
}

module.exports = {
  ONLYOFFICE_SUBAGENTS,
  getOnlyOfficeSubagents,
  getOnlyOfficeSubagent,
};
