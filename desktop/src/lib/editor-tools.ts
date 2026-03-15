/**
 * Editor tool execution relays tool calls from AI agents to the
 * embedded OnlyOffice editor.
 */

import type { ToolExecutionResult } from '../types/agent-types';

export interface EditorCommand {
    messageType: 'apply-actions' | 'request-read';
    actions?: unknown[];
    action?: string;
    params?: Record<string, unknown>;
}

type ApplyFn = (command: EditorCommand) => Promise<ToolExecutionResult>;

function spreadsheetTool(toolName: string, args: Record<string, unknown>, apply: ApplyFn): Promise<ToolExecutionResult> {
    switch (toolName) {
        case 'setCellValue':
            return exec(apply, { messageType: 'apply-actions', actions: [{ type: 'set_cell', cell: args.cell, value: args.value }] });
        case 'writeCells':
            return exec(apply, { messageType: 'apply-actions', actions: [{ type: 'write_cells', sheet: args.sheet, range: args.range, values: args.values }] });
        case 'setCellFormula':
            return exec(apply, { messageType: 'apply-actions', actions: [{ type: 'set_formula', cell: args.cell, formula: args.formula }] });
        case 'formatCells':
            return exec(apply, {
                messageType: 'apply-actions',
                actions: [{
                    type: 'format_cells',
                    range: args.range,
                    format: {
                        bold: args.bold,
                        italic: args.italic,
                        fontSize: args.fontSize,
                        fontColor: args.fontColor,
                        fill: args.bgColor,
                        numberFormat: args.numberFormat,
                        horizontalAlignment: args.horizontalAlignment,
                        borders: args.borders,
                    },
                }],
            });
        case 'insertRowsColumns':
            return exec(apply, { messageType: 'apply-actions', actions: [{ type: 'insert_rows_columns', insertType: args.type, index: args.index, count: args.count }] });
        case 'deleteRowsColumns':
            return exec(apply, { messageType: 'apply-actions', actions: [{ type: 'delete_rows_columns', deleteType: args.type, index: args.index, count: args.count }] });
        case 'createChart':
            return exec(apply, { messageType: 'apply-actions', actions: [{ type: 'create_chart', dataRange: args.dataRange, chartType: args.chartType, title: args.title, position: args.position }] });
        case 'createSheet':
            return exec(apply, { messageType: 'apply-actions', actions: [{ type: 'create_sheet', name: args.name, activate: args.activate }] });
        case 'readSheet':
            return exec(apply, { messageType: 'apply-actions', actions: [{ type: 'read_sheet', sheet: args.sheet, previewType: args.previewType }] });
        default:
            return Promise.resolve({ success: false, message: `Unknown spreadsheet tool: ${toolName}` });
    }
}

function documentTool(toolName: string, args: Record<string, unknown>, apply: ApplyFn): Promise<ToolExecutionResult> {
    switch (toolName) {
        case 'insertText':
            return exec(apply, { messageType: 'apply-actions', actions: [{ type: 'insert_text', text: args.text, position: args.position || 'cursor' }] });
        case 'formatText':
            return Promise.resolve({
                success: false,
                message: 'Rich text formatting of an existing document selection is not exposed reliably by this bridge. Insert formatted replacement text or format manually in the editor.',
            });
        case 'insertTable':
            return exec(apply, { messageType: 'apply-actions', actions: [{ type: 'insert_table', rows: args.rows, cols: args.cols, data: args.data }] });
        case 'findAndReplace':
            return exec(apply, { messageType: 'apply-actions', actions: [{ type: 'replace_text', find: args.find, replace: args.replace, matchCase: args.matchCase, replaceAll: args.replaceAll }] });
        case 'insertList':
            return exec(apply, { messageType: 'apply-actions', actions: [{ type: 'insert_list', listType: args.type, items: args.items }] });
        case 'insertPageBreak':
            return Promise.resolve({
                success: false,
                message: 'OnlyOffice SDKJS in this bridge does not expose a stable page-break API. Insert a visible section marker instead, or add the break manually in the editor.',
            });
        default:
            return Promise.resolve({ success: false, message: `Unknown document tool: ${toolName}` });
    }
}

function presentationTool(toolName: string, args: Record<string, unknown>, apply: ApplyFn): Promise<ToolExecutionResult> {
    switch (toolName) {
        case 'listSlideShapes':
            return exec(apply, {
                messageType: 'request-read',
                action: 'list_slide_shapes',
                params: { slide_index: args.slideIndex },
            });
        case 'readSlideText':
            return exec(apply, {
                messageType: 'request-read',
                action: 'read_slide_text',
                params: { slide_index: args.slideIndex, shape_id: args.shapeId },
            });
        case 'verifySlides':
            return exec(apply, {
                messageType: 'request-read',
                action: 'verify_slides',
                params: {},
            });
        case 'screenshotSlide':
            return exec(apply, {
                messageType: 'request-read',
                action: 'screenshot_slide',
                params: { slide_index: args.slideIndex },
            });
        case 'addSlide':
            return exec(apply, {
                messageType: 'apply-actions',
                actions: [{ type: 'add_slide', layout: args.layout, position: args.position }],
            });
        case 'deleteSlide':
            return exec(apply, {
                messageType: 'apply-actions',
                actions: [{ type: 'delete_slide', slide_index: args.slideIndex }],
            });
        case 'duplicateSlide':
            return exec(apply, {
                messageType: 'apply-actions',
                actions: [{ type: 'duplicate_slide', slide_index: args.slideIndex }],
            });
        case 'setSlideText':
            return exec(apply, {
                messageType: 'apply-actions',
                actions: [{
                    type: 'set_slide_text',
                    slide_index: args.slideIndex,
                    placeholder: args.placeholder,
                    text: args.text,
                }],
            });
        case 'addShape':
            return exec(apply, {
                messageType: 'apply-actions',
                actions: [{
                    type: 'add_shape',
                    slide_index: args.slideIndex,
                    shape_type: args.shapeType,
                    x: args.x,
                    y: args.y,
                    width: args.width,
                    height: args.height,
                    fill_color: args.fillColor,
                }],
            });
        case 'formatSlideText':
            return exec(apply, {
                messageType: 'apply-actions',
                actions: [{
                    type: 'format_slide_text',
                    slide_index: args.slideIndex,
                    placeholder: args.placeholder,
                    bold: args.bold,
                    italic: args.italic,
                    font_size: args.fontSize,
                    font_color: args.fontColor,
                    alignment: args.alignment,
                }],
            });
        case 'addChart':
            return exec(apply, {
                messageType: 'apply-actions',
                actions: [{
                    type: 'add_chart',
                    slide_index: args.slideIndex,
                    chart_type: args.chartType,
                    series: args.series,
                    series_names: args.seriesNames,
                    category_names: args.categoryNames,
                    width: args.width,
                    height: args.height,
                    title: args.title,
                    x: args.x,
                    y: args.y,
                }],
            });
        case 'insertImage':
            return exec(apply, {
                messageType: 'apply-actions',
                actions: [{
                    type: 'insert_image',
                    slide_index: args.slideIndex,
                    url: args.url,
                    x: args.x,
                    y: args.y,
                    width: args.width,
                    height: args.height,
                }],
            });
        default:
            return Promise.resolve({ success: false, message: `Unknown presentation tool: ${toolName}` });
    }
}

function pdfTool(toolName: string, args: Record<string, unknown>, apply: ApplyFn): Promise<ToolExecutionResult> {
    switch (toolName) {
        case 'addAnnotation':
            return exec(apply, { messageType: 'apply-actions', actions: [{ type: 'pdf.addAnnotation', page: args.page, text: args.text, x: args.x, y: args.y, annotationType: args.type }] });
        case 'highlightText':
            return exec(apply, { messageType: 'apply-actions', actions: [{ type: 'pdf.highlightText', page: args.page, text: args.text, color: args.color }] });
        case 'extractText':
            return Promise.resolve({
                success: false,
                message: 'PDF text extraction is unavailable in the current embedded SDK bridge. Export the file or open the source document for text operations.',
            });
        case 'addStamp':
            return exec(apply, { messageType: 'apply-actions', actions: [{ type: 'pdf.addStamp', page: args.page, text: args.text, color: args.color }] });
        case 'summarizePage':
            return Promise.resolve({
                success: false,
                message: 'Direct PDF page summarization requires text extraction, which is unavailable in the embedded bridge. Extract content externally first, then summarize.',
            });
        default:
            return Promise.resolve({ success: false, message: `Unknown PDF tool: ${toolName}` });
    }
}

export async function executeAgentTool(
    contextType: string,
    toolName: string,
    args: Record<string, unknown>,
    applyFn: ApplyFn,
): Promise<ToolExecutionResult> {
    switch (contextType) {
        case 'spreadsheet':
            return await spreadsheetTool(toolName, args, applyFn);
        case 'document':
            return await documentTool(toolName, args, applyFn);
        case 'presentation':
            return await presentationTool(toolName, args, applyFn);
        case 'pdf':
            return await pdfTool(toolName, args, applyFn);
        default:
            return { success: false, message: `Unknown context: ${contextType}` };
    }
}

async function exec(apply: ApplyFn, command: EditorCommand): Promise<ToolExecutionResult> {
    try {
        return await apply(command);
    } catch (err) {
        return { success: false, message: `Failed to execute: ${err instanceof Error ? err.message : String(err)}` };
    }
}
