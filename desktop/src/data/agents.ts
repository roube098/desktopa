import type { AgentConfig, AgentTool } from '../types/agent-types';
import {
    buildOnlyOfficePresentationPrompt,
    getOnlyOfficePresentationDescription,
    getOnlyOfficePresentationSuggestions,
    getOnlyOfficePresentationTools,
} from './presentation-prompt';

const GENERATION_TOOLS: AgentTool[] = [
    {
        name: 'createFile',
        description: 'Create a new file in My Workspace. Auto-select format from explicit prompt cues, or ask when ambiguous.',
        parameters: [
            { name: 'format', type: 'string', description: 'Target format: xlsx, docx, pptx, or pdf.' },
            { name: 'title', type: 'string', description: 'Output title used for deterministic naming.' },
            { name: 'prompt', type: 'string', description: 'Original user prompt for format inference and intent checks.' },
            { name: 'open', type: 'boolean', description: 'Open the generated file in OnlyOffice after creation (default true).' },
            { name: 'confirm', type: 'boolean', description: 'Set to true only after the user explicitly confirms creating/opening a new file when no file is open.' },
        ],
    },
    {
        name: 'exportCurrentFile',
        description: 'Export the current file to PDF in My Workspace.',
        parameters: [
            { name: 'targetFormat', type: 'string', description: 'Export target format (currently pdf).' },
            { name: 'title', type: 'string', description: 'Optional output title for deterministic naming.' },
            { name: 'prompt', type: 'string', description: 'Original user prompt for intent checks.' },
            { name: 'fileName', type: 'string', description: 'Optional source file name override.' },
            { name: 'open', type: 'boolean', description: 'Open exported file in OnlyOffice (default false).' },
        ],
    },
];

const PRESENTATION_AGENT_TOOLS: AgentTool[] = [
    ...GENERATION_TOOLS,
    ...getOnlyOfficePresentationTools(),
];

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Spreadsheet Agent Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const spreadsheetAgent: AgentConfig = {
    id: 'spreadsheet-agent',
    name: 'Spreadsheet Agent',
    icon: 'M3 3h18v18H3V3zm2 4v12h14V7H5zm2 2h4v3H7V9zm6 0h4v3h-4V9zm-6 5h4v3H7v-3zm6 0h4v3h-4v-3z',
    color: '#22c55e',
    colorLight: 'rgba(34,197,94,0.12)',
    description: 'Specialized in spreadsheet operations Ã¢â‚¬â€ formulas, cell formatting, charts, and data analysis.',
    contextValue: 'spreadsheet',
    fileTypes: ['.xlsx', '.xls', '.csv'],
    systemPrompt: `You are an expert Spreadsheet Assistant for workspace .xlsx files (openpyxl).
You help users build, edit, format, and analyze spreadsheet data using tool calls. Tools read and write the workbook on disk; omit path when the active desktop .xlsx should be used. Sheet defaults to Sheet1 when omitted.

## Capabilities
- Write data and formulas to cells (individual or bulk 2D arrays)
- Create formulas (SUM, VLOOKUP, IF, INDEX/MATCH, XLOOKUP, etc.)
- Format cells (bold, colors, borders, number formats, alignment)
- Add/remove rows and columns (1-based row/column indices, Excel-style)
- Create and manage multiple worksheets
- Create charts from data ranges (supported: bar, line, pie; first row series names, first column categories when multi-column)
- Read and validate sheet content (inspect values or formulas for errors; reads cap at 500x50 cells)
- Sort and filter data (manual via writes; no dedicated sort tool)

## Mandatory Workflow Per Sheet

You MUST complete this full cycle for EACH sheet before creating the next:
1. CREATE: createSheet
2. WRITE: writeCells (populate with data and formulas)
3. VALIDATE: readSheet (previewType: "values") Ã¢â‚¬â€ check data landed correctly
   - IF ERRORS: readSheet with previewType: "formulas" to debug, then writeCells to fix
4. FORMAT: formatCells (apply styling, number formats, colors)
5. NEXT: Only now create the next sheet

FORBIDDEN:
- Batching multiple sheets at once
- Skipping validation
- Formatting before validating
- Creating Sheet 2 before Sheet 1 is fully validated and formatted

## writeCells 2D Array Rules

Every row in the values array MUST have the same number of columns as the range width.
- For range B2:D5 (3 columns), EVERY row needs exactly 3 items
- Empty cells: ["", "", ""] NOT [""]
- WRONG (jagged): [["Title", "", ""], ["Header", "Val"], ["Data"]]
- CORRECT (rectangular): [["Title", "", ""], ["Header", "Val", ""], ["Data", "", ""]]
- PAD WITH EMPTY STRINGS if a row is shorter than the range width.

## formatCells Rules

Only accepts a SINGLE contiguous range. Comma-separated ranges will error.
- WRONG: "B4:D4,B11:D11"
- CORRECT: Make separate formatCells calls for each range

Examples:
- Currency: { "range": "C6:G10", "numberFormat": "#,##0;(#,##0)" }
- Percentage: { "range": "C7:G7", "numberFormat": "0.0%", "italic": true }

## Formula Syntax

- Multiplication: =A1*B1 (NOT =A1B1)
- Division: =A1/B1
- Cross-sheet: =SheetName!A1 or ='Sheet Name'!A1
- Growth rate: =B2/B1-1
- Percentage calc: =A1*(1+B1)

PERCENTAGE RULE: Percentages MUST be stored as decimals.
- 5% growth Ã¢â€ â€™ store 0.05, use =Base*(1+0.05)
- 35% margin Ã¢â€ â€™ store 0.35, use =Revenue*0.35
- WRONG: store 5 and use =Base*(1+5) Ã¢â€ â€™ that's 600% growth!

## Row Tracking (Critical for Formulas)

BEFORE every writeCells call with formulas, mentally build a ROW MAPPING TABLE:
- Array index 0 Ã¢â€ â€™ Start row of range
- Array index N Ã¢â€ â€™ Start row + N

Example for range B2:G7:
  Index 0 Ã¢â€ â€™ Row 2: TITLE
  Index 1 Ã¢â€ â€™ Row 3: Headers
  Index 2 Ã¢â€ â€™ Row 4: Revenue (data starts here Ã¢â€ â€™ C4)
  Index 3 Ã¢â€ â€™ Row 5: COGS Ã¢â€ â€™ formula uses =C4*0.6 (NOT =C3!)
  Index 4 Ã¢â€ â€™ Row 6: Gross Profit Ã¢â€ â€™ =C4-C5 (NOT =C3-C4!)

Formula: Cell Row = Range Start Row + Array Index

THE GOLDEN RULE: Reference cells by their ACTUAL position, not their logical position.

Common bugs to avoid:
- Referencing Row 1 or Column A (they should be empty when model starts at B2)
- Off-by-one errors on cross-sheet references
- Referencing a label column (B) when you mean a value column (C+)
- Self-referencing formulas (circular references)

## Cross-Sheet References

The origin offset applies to ALL sheets. When referencing another sheet:
1. Know the actual row number on that sheet
2. Use the actual row number: =Assumptions!$C$19 if the data is in row 19
3. Do NOT mentally subtract 1

## Chart Guidelines

Selection:
- Line charts: trends over time
- Column/Bar charts: comparisons between categories
- Pie charts: share of total (use sparingly)
- Stacked charts: total volume with individual contributions

Formatting:
- Always include a clear, descriptive title
- Place charts adjacent to the data table
- Add a legend when there are multiple series

## Error Recovery

NEVER stop on errors. If a tool returns an error:
1. formatCells error Ã¢â€ â€™ likely comma-separated ranges. Fix: make separate calls.
2. writeCells error Ã¢â€ â€™ likely mismatched row lengths. Fix: ensure rectangular 2D array.
3. Any error Ã¢â€ â€™ diagnose, correct, and retry. Always continue to the next step.

## Response Guidelines

1. Acknowledge the user's request
2. Explain what you will do
3. Execute tools one at a time Ã¢â‚¬â€ wait for confirmation before proceeding
4. After completion, provide a brief summary of what was built

For explicit generation requests (create/generate/new file/export as), call createFile or exportCurrentFile.
If createFile returns a confirmation-required response, ask the user to confirm and then call createFile again with confirm=true.
Use hybrid format selection: auto-select when explicit, ask when ambiguous.
Treat "xlsv" as "xlsx".
Be concise and precise with cell references (e.g. A1, B2:D10).`,
    tools: [
        ...GENERATION_TOOLS,
        {
            name: 'setCellValue',
            description: 'Set the value of a single cell in the workspace .xlsx',
            parameters: [
                { name: 'path', type: 'string', description: 'Optional workspace path to .xlsx; defaults to active file' },
                { name: 'sheet', type: 'string', description: 'Worksheet name; defaults to Sheet1' },
                { name: 'cell', type: 'string', description: 'Cell reference (e.g. "A1")', required: true },
                { name: 'value', type: 'string', description: 'Value to set', required: true },
            ],
        },
        {
            name: 'writeCells',
            description: 'Write a 2D array of values and/or formulas to a range. Every row MUST have the same number of columns as the range width.',
            parameters: [
                { name: 'path', type: 'string', description: 'Optional workspace path to .xlsx; defaults to active file' },
                { name: 'sheet', type: 'string', description: 'Target sheet name (e.g. "Sheet1")', required: true },
                { name: 'range', type: 'string', description: 'Target range (e.g. "B2:F10")', required: true },
                { name: 'values', type: 'array', description: 'Rectangular 2D array of values. Formulas start with "=". Pad short rows with "".', required: true },
            ],
        },
        {
            name: 'setCellFormula',
            description: 'Set a formula in a single cell',
            parameters: [
                { name: 'path', type: 'string', description: 'Optional workspace path to .xlsx; defaults to active file' },
                { name: 'sheet', type: 'string', description: 'Worksheet name; defaults to Sheet1' },
                { name: 'cell', type: 'string', description: 'Cell reference (e.g. "A1")', required: true },
                { name: 'formula', type: 'string', description: 'Formula to set (e.g. "=SUM(A1:A10)")', required: true },
            ],
        },
        {
            name: 'formatCells',
            description: 'Apply formatting to a single contiguous range. Make separate calls for non-contiguous ranges.',
            parameters: [
                { name: 'path', type: 'string', description: 'Optional workspace path to .xlsx; defaults to active file' },
                { name: 'sheet', type: 'string', description: 'Worksheet name; defaults to Sheet1' },
                { name: 'range', type: 'string', description: 'Single contiguous range (e.g. "A1:C5"). No comma-separated ranges.', required: true },
                { name: 'bold', type: 'boolean', description: 'Set bold' },
                { name: 'italic', type: 'boolean', description: 'Set italic' },
                { name: 'fontSize', type: 'number', description: 'Font size in pt' },
                { name: 'fontColor', type: 'string', description: 'Font color hex (e.g. "#FF0000")' },
                { name: 'bgColor', type: 'string', description: 'Background color hex (e.g. "#203864")' },
                { name: 'numberFormat', type: 'string', description: 'Number format string (e.g. "#,##0", "0.0%", "#,##0;(#,##0)")' },
                { name: 'horizontalAlignment', type: 'string', description: 'Horizontal alignment: "left", "center", "right"' },
                { name: 'borders', type: 'string', description: 'Border style: "all", "bottom", "top", "outline"' },
            ],
        },
        {
            name: 'insertRowsColumns',
            description: 'Insert rows or columns before the given 1-based index (Excel-style)',
            parameters: [
                { name: 'path', type: 'string', description: 'Optional workspace path to .xlsx; defaults to active file' },
                { name: 'sheet', type: 'string', description: 'Worksheet name; defaults to Sheet1' },
                { name: 'type', type: 'string', description: '"row" or "column"', required: true },
                { name: 'index', type: 'number', description: '1-based row or column index before which to insert', required: true },
                { name: 'count', type: 'number', description: 'Number to insert', required: true },
            ],
        },
        {
            name: 'deleteRowsColumns',
            description: 'Delete rows or columns starting at the given 1-based index',
            parameters: [
                { name: 'path', type: 'string', description: 'Optional workspace path to .xlsx; defaults to active file' },
                { name: 'sheet', type: 'string', description: 'Worksheet name; defaults to Sheet1' },
                { name: 'type', type: 'string', description: '"row" or "column"', required: true },
                { name: 'index', type: 'number', description: '1-based starting row or column index', required: true },
                { name: 'count', type: 'number', description: 'Number to delete', required: true },
            ],
        },
        {
            name: 'createChart',
            description: 'Create a bar, line, or pie chart from a data range (openpyxl). Multi-column: row 1 = series names, column 1 = categories.',
            parameters: [
                { name: 'path', type: 'string', description: 'Optional workspace path to .xlsx; defaults to active file' },
                { name: 'sheet', type: 'string', description: 'Worksheet name; defaults to Sheet1' },
                { name: 'dataRange', type: 'string', description: 'Data range (e.g. "A1:D10")', required: true },
                { name: 'chartType', type: 'string', description: 'bar, line, or pie', required: true },
                { name: 'title', type: 'string', description: 'Chart title (always include a descriptive title)' },
                { name: 'position', type: 'string', description: 'Cell to place the chart at (e.g. "G2")' },
            ],
        },
        {
            name: 'createSheet',
            description: 'Create a new worksheet. After creating, immediately populate it with writeCells.',
            parameters: [
                { name: 'path', type: 'string', description: 'Optional workspace path to .xlsx; defaults to active file' },
                { name: 'name', type: 'string', description: 'Name for the new worksheet', required: true },
                { name: 'activate', type: 'boolean', description: 'Whether to activate (switch to) the new sheet after creation' },
            ],
        },
        {
            name: 'readSheet',
            description: 'Read sheet content and check for errors. Use "values" to verify data, "formulas" to debug formula errors.',
            parameters: [
                { name: 'path', type: 'string', description: 'Optional workspace path to .xlsx; defaults to active file' },
                { name: 'sheet', type: 'string', description: 'Name of the sheet to read', required: true },
                { name: 'previewType', type: 'string', description: '"values" to see calculated results, "formulas" to see raw formulas for debugging' },
            ],
        },
    ],
    suggestions: [
        'Create a SUM formula for column B',
        'Format the header row with bold and navy background',
        'Build a monthly budget with Assumptions and Summary sheets',
        'Add a line chart showing the revenue trend',
        'Read the current sheet and check for formula errors',
        'Create a new worksheet called "Dashboard"',
    ],
};

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Document Agent Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const documentAgent: AgentConfig = {
    id: 'document-agent',
    name: 'Document Agent',
    icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM7 13h10v1H7v-1zm0 3h10v1H7v-1zm0-6h5v1H7v-1z',
    color: '#3b82f6',
    colorLight: 'rgba(59,130,246,0.12)',
    description: 'Specialized in document editing Ã¢â‚¬â€ text formatting, paragraphs, tables, and content structure.',
    contextValue: 'document',
    fileTypes: ['.docx', '.doc'],
    systemPrompt: `You are an expert Document Assistant for OnlyOffice Documents.
You help users write, edit, and format documents. You can:
- Insert and edit text content
- Format text (bold, italic, headings, font size, colors)
- Add and format tables
- Insert page breaks and section breaks
- Find and replace text
- Create lists (bulleted, numbered)
- Add headers and footers

When the user asks you to perform an action, describe what you will do and then call the appropriate tool.
For explicit generation requests (create/generate/new file/export as), call createFile or exportCurrentFile.
If createFile returns a confirmation-required response, ask the user to confirm and then call createFile again with confirm=true.
Use hybrid format selection: auto-select when explicit, ask when ambiguous.
Be helpful with writing suggestions and document structure.`,
    tools: [
        ...GENERATION_TOOLS,
        {
            name: 'insertText',
            description: 'Insert text at the current cursor position or at a specific location',
            parameters: [
                { name: 'text', type: 'string', description: 'Text content to insert', required: true },
                { name: 'position', type: 'string', description: 'Where to insert: "cursor", "start", "end"' },
            ],
        },
        {
            name: 'formatText',
            description: 'Apply formatting to selected text or a text range',
            parameters: [
                { name: 'bold', type: 'boolean', description: 'Set bold' },
                { name: 'italic', type: 'boolean', description: 'Set italic' },
                { name: 'underline', type: 'boolean', description: 'Set underline' },
                { name: 'fontSize', type: 'number', description: 'Font size in pt' },
                { name: 'fontColor', type: 'string', description: 'Font color hex' },
                { name: 'fontFamily', type: 'string', description: 'Font family name' },
                { name: 'heading', type: 'string', description: 'Heading level: "h1", "h2", "h3", or "normal"' },
            ],
        },
        {
            name: 'insertTable',
            description: 'Insert a table at the current position',
            parameters: [
                { name: 'rows', type: 'number', description: 'Number of rows', required: true },
                { name: 'cols', type: 'number', description: 'Number of columns', required: true },
                { name: 'data', type: 'array', description: 'Optional 2D array of cell values', items: { type: 'array' } },
            ],
        },
        {
            name: 'findAndReplace',
            description: 'Find and replace text in the document',
            parameters: [
                { name: 'find', type: 'string', description: 'Text to find', required: true },
                { name: 'replace', type: 'string', description: 'Replacement text', required: true },
                { name: 'matchCase', type: 'boolean', description: 'Case-sensitive match' },
                { name: 'replaceAll', type: 'boolean', description: 'Replace all occurrences' },
            ],
        },
        {
            name: 'insertList',
            description: 'Insert a bulleted or numbered list',
            parameters: [
                { name: 'type', type: 'string', description: '"bullet" or "numbered"', required: true },
                { name: 'items', type: 'array', description: 'List items as strings', required: true, items: { type: 'string' } },
            ],
        },
        {
            name: 'insertPageBreak',
            description: 'Insert a page break at the current position',
            parameters: [],
        },
    ],
    suggestions: [
        'Insert a heading at the top',
        'Create a 3x4 table',
        'Find and replace a word',
        'Add a bulleted list',
    ],
};

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Presentation Agent Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const presentationAgent: AgentConfig = {
    id: 'presentation-agent',
    name: 'Presentation Agent',
    icon: 'M2 3h20v14H2V3zm2 2v10h16V5H4zm3 12h10v2H7v-2zm2-8h6v1H9V9zm-1 3h8v1H8v-1z',
    color: '#f59e0b',
    colorLight: 'rgba(245,158,11,0.12)',
    description: getOnlyOfficePresentationDescription(),
    contextValue: 'presentation',
    fileTypes: ['.pptx', '.ppt'],
    systemPrompt: buildOnlyOfficePresentationPrompt(),
    tools: PRESENTATION_AGENT_TOOLS,
    suggestions: getOnlyOfficePresentationSuggestions(),
};
const pdfAgent: AgentConfig = {
    id: 'pdf-agent',
    name: 'PDF Agent',
    icon: 'M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6zm7 1.5L18.5 9H13V3.5zM8 12h3c1.1 0 2 .45 2 1.5S12.1 15 11 15H9v2H8v-5zm1 2h2c.55 0 1-.22 1-.5s-.45-.5-1-.5H9v1zm5-2h2.5c.83 0 1.5.45 1.5 1.5 0 .63-.38 1.12-.91 1.35.58.18 1.01.72 1.01 1.4 0 1.05-.67 1.75-1.6 1.75H14v-6z',
    color: '#ef4444',
    colorLight: 'rgba(239,68,68,0.12)',
    description: 'Specialized in PDF operations Ã¢â‚¬â€ annotations, highlights, comments, and text extraction.',
    contextValue: 'pdf',
    fileTypes: ['.pdf'],
    systemPrompt: `You are an expert PDF Assistant for OnlyOffice PDF viewer.
You help users work with PDF documents. You can:
- Add text annotations and comments
- Highlight text passages
- Add sticky notes
- Extract and summarize text content
- Navigate through pages
- Add text stamps

When the user asks you to perform an action, describe what you will do and then call the appropriate tool.
For explicit generation requests (create/generate/new file/export as), call createFile or exportCurrentFile.
If createFile returns a confirmation-required response, ask the user to confirm and then call createFile again with confirm=true.
Use hybrid format selection: auto-select when explicit, ask when ambiguous.
Be helpful with summarizing and extracting information from the document.`,
    tools: [
        ...GENERATION_TOOLS,
        {
            name: 'addAnnotation',
            description: 'Add a text annotation or comment to the PDF',
            parameters: [
                { name: 'page', type: 'number', description: 'Page number (1-based)', required: true },
                { name: 'text', type: 'string', description: 'Annotation text', required: true },
                { name: 'x', type: 'number', description: 'X position on page (0-1 ratio)' },
                { name: 'y', type: 'number', description: 'Y position on page (0-1 ratio)' },
                { name: 'type', type: 'string', description: '"comment", "highlight", "note"' },
            ],
        },
        {
            name: 'highlightText',
            description: 'Highlight text on a specific page',
            parameters: [
                { name: 'page', type: 'number', description: 'Page number (1-based)', required: true },
                { name: 'text', type: 'string', description: 'Text to highlight', required: true },
                { name: 'color', type: 'string', description: 'Highlight color: "yellow", "green", "blue", "red"' },
            ],
        },
        {
            name: 'extractText',
            description: 'Extract text content from one or more pages',
            parameters: [
                { name: 'startPage', type: 'number', description: 'Start page number (1-based)', required: true },
                { name: 'endPage', type: 'number', description: 'End page number (1-based)' },
            ],
        },
        {
            name: 'addStamp',
            description: 'Add a text stamp to the PDF',
            parameters: [
                { name: 'page', type: 'number', description: 'Page number (1-based)', required: true },
                { name: 'text', type: 'string', description: 'Stamp text (e.g. "APPROVED", "DRAFT")', required: true },
                { name: 'color', type: 'string', description: 'Stamp color hex' },
            ],
        },
        {
            name: 'summarizePage',
            description: 'Summarize the content of a page or page range',
            parameters: [
                { name: 'startPage', type: 'number', description: 'Start page (1-based)', required: true },
                { name: 'endPage', type: 'number', description: 'End page (1-based)' },
            ],
        },
    ],
    suggestions: [
        'Summarize this document',
        'Highlight important sections',
        'Add a comment on page 1',
        'Extract text from all pages',
    ],
};

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Agent Registry Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
export const AGENTS: AgentConfig[] = [
    spreadsheetAgent,
    documentAgent,
    presentationAgent,
    pdfAgent,
];

/**
 * Look up the agent matching a given documentContext value.
 * Falls back to spreadsheetAgent when no match is found.
 */
export function getAgentForContext(context: string): AgentConfig {
    return AGENTS.find(a => a.contextValue === context) || spreadsheetAgent;
}

/**
 * Look up the agent matching a given file extension (e.g. '.xlsx').
 */
export function getAgentForExtension(ext: string): AgentConfig {
    const normalised = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
    return AGENTS.find(a => a.fileTypes.includes(normalised)) || spreadsheetAgent;
}







