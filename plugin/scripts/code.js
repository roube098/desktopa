(function () {
  "use strict";

  // ═══════════════════════════════════════════════════════════
  //  STATE
  // ═══════════════════════════════════════════════════════════

  let plannedActions = [];
  let chatHistory = [];
  let editorType = "spreadsheet";

  const el = {
    backendUrl: null,
    prompt: null,
    message: null,
    actions: null,
    planBtn: null,
    applyBtn: null,
    clearBtn: null,
  };

  function q(id) {
    return document.getElementById(id);
  }

  function setBusy(isBusy) {
    el.planBtn.disabled = isBusy;
    el.applyBtn.disabled = isBusy || plannedActions.length === 0;
  }

  function showError(err) {
    const msg = err && err.message ? err.message : String(err);
    el.message.textContent = "Error: " + msg;
  }

  function pretty(value) {
    return JSON.stringify(value, null, 2);
  }

  // ═══════════════════════════════════════════════════════════
  //  EDITOR DETECTION
  // ═══════════════════════════════════════════════════════════

  function detectEditorType() {
    try {
      if (typeof Asc !== "undefined" && Asc.plugin && Asc.plugin.info) {
        var info = Asc.plugin.info;
        if (info.editorType === "cell" || info.editorType === "spreadsheet") return "spreadsheet";
        if (info.editorType === "word" || info.editorType === "document") return "document";
        if (info.editorType === "slide" || info.editorType === "presentation") return "presentation";
        if (info.editorType === "pdf") return "pdf";
      }
    } catch (_) { }
    return "spreadsheet";
  }

  // ═══════════════════════════════════════════════════════════
  //  RUNTIME CONFIG & PERSISTENCE
  // ═══════════════════════════════════════════════════════════

  async function loadRuntimeConfig() {
    try {
      var response = await fetch("runtime-config.json", { cache: "no-store" });
      if (!response.ok) return {};
      return await response.json();
    } catch (err) {
      return {};
    }
  }

  function loadSavedBackendUrl() {
    try {
      return window.localStorage.getItem("spreadsheet_ai_backend_url") || "";
    } catch (err) {
      return "";
    }
  }

  function saveBackendUrl(url) {
    try {
      window.localStorage.setItem("spreadsheet_ai_backend_url", url);
    } catch (err) { }
  }

  // ═══════════════════════════════════════════════════════════
  //  GENERATE PLAN
  // ═══════════════════════════════════════════════════════════

  async function generatePlan() {
    var prompt = el.prompt.value.trim();
    if (!prompt) {
      el.message.textContent = "Enter an instruction first.";
      return;
    }

    var backend = el.backendUrl.value.trim().replace(/\/$/, "");
    if (!backend) {
      el.message.textContent = "Backend URL is required.";
      return;
    }
    saveBackendUrl(backend);

    setBusy(true);
    el.message.textContent = "Generating plan...";

    try {
      var res = await fetch(backend + "/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt,
          history: chatHistory,
          context: editorType,
        }),
      });

      if (!res.ok) {
        throw new Error("Planner request failed (" + res.status + ")");
      }

      var data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Planner returned failure");
      }

      plannedActions = Array.isArray(data.actions) ? data.actions : [];
      el.actions.textContent = pretty(plannedActions);
      el.message.textContent = data.assistant_message || "Plan ready.";

      chatHistory.push({ role: "user", content: prompt });
      chatHistory.push({ role: "assistant", content: data.assistant_message || "Plan ready." });
      if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
    } catch (err) {
      plannedActions = [];
      el.actions.textContent = "[]";
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  APPLY PLAN — Full tool execution via OnlyOffice API
  // ═══════════════════════════════════════════════════════════

  function applyPlan() {
    if (!plannedActions.length) {
      el.message.textContent = "No actions to apply.";
      return;
    }

    el.message.textContent = "Applying actions...";

    if (editorType === "presentation" && window.PresentationBridgeCore) {
      window.PresentationBridgeCore.executePresentationRequest(
        { type: "apply-actions", actions: plannedActions },
        function (result) {
          el.message.textContent = result && result.success
            ? "Actions applied successfully."
            : (result && result.message) || "Presentation actions failed.";
        }
      );
      return;
    }

    Asc.scope.actions = plannedActions;
    Asc.scope.editorType = editorType;

    Asc.plugin.callCommand(
      function () {
        var actions = Asc.scope.actions || [];
        var edType = Asc.scope.editorType || "spreadsheet";

        // ─── Utility helpers ────────────────────────────
        function colToNumber(col) {
          var num = 0;
          for (var i = 0; i < col.length; i++) {
            num = num * 26 + (col.charCodeAt(i) - 64);
          }
          return num;
        }

        function numberToCol(num) {
          var col = "";
          var n = num;
          while (n > 0) {
            var rem = (n - 1) % 26;
            col = String.fromCharCode(65 + rem) + col;
            n = Math.floor((n - 1) / 26);
          }
          return col;
        }

        function parseCell(cell) {
          var match = /^([A-Z]+)(\d+)$/i.exec(String(cell || "").toUpperCase());
          if (!match) return null;
          return { col: colToNumber(match[1]), row: parseInt(match[2], 10) };
        }

        function parseRange(rangeStr) {
          var parts = String(rangeStr || "").split(":");
          var start = parseCell(parts[0]);
          var end = parts.length > 1 ? parseCell(parts[1]) : start;
          return { start: start, end: end };
        }

        function normalizeFormula(formula) {
          var f = String(formula || "").trim();
          return f.charAt(0) === "=" ? f : "=" + f;
        }

        function normalizeByMap(type, map, prefix) {
          var raw = String(type || "");
          if (map[raw]) return map[raw];
          if (prefix && raw.indexOf(prefix) === 0) {
            var stripped = raw.slice(prefix.length);
            if (map[stripped]) return map[stripped];
            return stripped;
          }
          return raw;
        }

        function normalizeDocumentActionType(type) {
          return normalizeByMap(type, {
            insertText: "insert_text",
            insertTable: "insert_table",
            findAndReplace: "replace_text",
            insertList: "insert_list",
            insertPageBreak: "insert_page_break",
            formatText: "format_text",
            "document.insertText": "insert_text",
            "document.insertTable": "insert_table",
            "document.findAndReplace": "replace_text",
            "document.insertList": "insert_list",
            "document.insertPageBreak": "insert_page_break",
            "document.formatText": "format_text",
          }, "document.");
        }

        function normalizePresentationActionType(type) {
          return normalizeByMap(type, {
            addSlide: "add_slide",
            setSlideText: "set_slide_text",
            deleteSlide: "delete_slide",
            addShape: "add_shape",
            formatSlideText: "format_slide_text",
            duplicateSlide: "duplicate_slide",
            "presentation.addSlide": "add_slide",
            "presentation.setSlideText": "set_slide_text",
            "presentation.deleteSlide": "delete_slide",
            "presentation.addShape": "add_shape",
            "presentation.formatSlideText": "format_slide_text",
            "presentation.duplicateSlide": "duplicate_slide",
          }, "presentation.");
        }

        function normalizePdfActionType(type) {
          return normalizeByMap(type, {
            addAnnotation: "add_annotation",
            addStamp: "add_stamp",
            highlightText: "highlight_text",
            extractText: "extract_text",
            summarizePage: "summarize_page",
            "pdf.addAnnotation": "add_annotation",
            "pdf.addStamp": "add_stamp",
            "pdf.highlightText": "highlight_text",
            "pdf.extractText": "extract_text",
            "pdf.summarizePage": "summarize_page",
          }, "pdf.");
        }

        // ─── SPREADSHEET ACTIONS ────────────────────────

        function applySpreadsheet(actions) {
          var activeSheet = Api.GetActiveSheet();

          for (var i = 0; i < actions.length; i++) {
            var a = actions[i] || {};
            var type = String(a.type || "");

            // Normalize desktop app action types (spreadsheet.X → X)
            if (type.indexOf("spreadsheet.") === 0) {
              var mapped = {
                "spreadsheet.setCellValue": "set_cell",
                "spreadsheet.writeCells": "write_cells",
                "spreadsheet.setCellFormula": "set_formula",
                "spreadsheet.formatCells": "format_cells",
                "spreadsheet.insertRowsColumns": "insert_rows_columns",
                "spreadsheet.deleteRowsColumns": "delete_rows_columns",
                "spreadsheet.createChart": "create_chart",
                "spreadsheet.createSheet": "create_sheet",
                "spreadsheet.readSheet": "read_sheet"
              };
              type = mapped[type] || type.replace("spreadsheet.", "");
            }

            // Resolve target sheet
            var sheet = activeSheet;
            if (a.sheet) {
              try {
                sheet = Api.GetSheet(a.sheet);
              } catch (e) {
                sheet = activeSheet;
              }
            }

            // ── set_cell ────────────────────────────────
            if (type === "set_cell") {
              sheet.GetRange(String(a.cell || "A1")).SetValue(a.value);
            }

            // ── set_formula ─────────────────────────────
            else if (type === "set_formula") {
              sheet.GetRange(String(a.cell || "A1")).SetValue(normalizeFormula(a.formula));
            }

            // ── set_range (bulk write) ──────────────────
            else if (type === "set_range") {
              var start = parseCell(String(a.start_cell || "A1"));
              var rows = Array.isArray(a.values) ? a.values : [];
              if (start && rows.length) {
                for (var r = 0; r < rows.length; r++) {
                  var rowValues = Array.isArray(rows[r]) ? rows[r] : [rows[r]];
                  for (var c = 0; c < rowValues.length; c++) {
                    var address = numberToCol(start.col + c) + (start.row + r);
                    var cellVal = rowValues[c];
                    // Check if it's a formula
                    if (typeof cellVal === "string" && cellVal.charAt(0) === "=") {
                      sheet.GetRange(address).SetValue(cellVal);
                    } else {
                      sheet.GetRange(address).SetValue(cellVal);
                    }
                  }
                }
              }
            }

            // ── write_cells (excelor-style tool) ────────
            else if (type === "write_cells") {
              var rng = parseRange(a.range || "A1");
              var dataRows = a.formulas || a.values || [];
              if (rng.start && dataRows.length) {
                for (var wr = 0; wr < dataRows.length; wr++) {
                  var rowData = Array.isArray(dataRows[wr]) ? dataRows[wr] : [dataRows[wr]];
                  for (var wc = 0; wc < rowData.length; wc++) {
                    var cellAddr = numberToCol(rng.start.col + wc) + (rng.start.row + wr);
                    var val = rowData[wc];
                    if (a.formulas && typeof val === "string" && val.charAt(0) !== "=") {
                      val = "=" + val;
                    }
                    sheet.GetRange(cellAddr).SetValue(val);
                  }
                }
              }
            }

            // ── clear_range ─────────────────────────────
            else if (type === "clear_range") {
              var clearRng = parseRange(a.range || "");
              if (clearRng.start && clearRng.end) {
                var rowStart = Math.min(clearRng.start.row, clearRng.end.row);
                var rowEnd = Math.max(clearRng.start.row, clearRng.end.row);
                var colStart = Math.min(clearRng.start.col, clearRng.end.col);
                var colEnd = Math.max(clearRng.start.col, clearRng.end.col);
                for (var rr = rowStart; rr <= rowEnd; rr++) {
                  for (var cc = colStart; cc <= colEnd; cc++) {
                    sheet.GetRange(numberToCol(cc) + rr).SetValue("");
                  }
                }
              }
            }

            // ── format_cells ────────────────────────────
            else if (type === "format_cells") {
              // Accept both nested { format: {...} } and flat props for backward compat
              var fmt = a.format || {};
              if (!a.format) {
                fmt = {
                  bold: a.bold, italic: a.italic, fontSize: a.fontSize,
                  fontColor: a.fontColor, fill: a.bgColor || a.fill,
                  numberFormat: a.numberFormat, horizontalAlignment: a.horizontalAlignment,
                  borders: a.borders, wrapText: a.wrapText, merge: a.merge, size: a.size, color: a.color
                };
              }
              var fmtRange = sheet.GetRange(String(a.range || "A1"));

              if (fmt.bold !== undefined) fmtRange.SetBold(fmt.bold);
              if (fmt.italic !== undefined) fmtRange.SetItalic(fmt.italic);
              if (fmt.fontSize || fmt.size) fmtRange.SetFontSize(fmt.fontSize || fmt.size);
              if (fmt.fontColor || fmt.color) {
                var fc = String(fmt.fontColor || fmt.color);
                fmtRange.SetFontColor(Api.CreateColorFromRGB(
                  parseInt(fc.slice(1, 3), 16),
                  parseInt(fc.slice(3, 5), 16),
                  parseInt(fc.slice(5, 7), 16)
                ));
              }
              if (fmt.fill || fmt.bgColor) {
                var fillColor = String(fmt.fill || fmt.bgColor);
                fmtRange.SetFillColor(Api.CreateColorFromRGB(
                  parseInt(fillColor.slice(1, 3), 16),
                  parseInt(fillColor.slice(3, 5), 16),
                  parseInt(fillColor.slice(5, 7), 16)
                ));
              }
              if (fmt.numberFormat) fmtRange.SetNumberFormat(fmt.numberFormat);
              if (fmt.horizontalAlignment) {
                var hAlign = String(fmt.horizontalAlignment).toLowerCase();
                if (hAlign === "center") fmtRange.SetAlignHorizontal("center");
                else if (hAlign === "right") fmtRange.SetAlignHorizontal("right");
                else if (hAlign === "left") fmtRange.SetAlignHorizontal("left");
              }
              if (fmt.wrapText !== undefined) fmtRange.SetWrap(fmt.wrapText);
              if (fmt.merge) fmtRange.Merge(true);

              if (fmt.borders) {
                var borderType = String(fmt.borders).toLowerCase();
                var borderColor = Api.CreateColorFromRGB(0, 0, 0);
                if (borderType === "all" || borderType === "outline" || borderType === "bottom") {
                  fmtRange.SetBorders("Bottom", "Thin", borderColor);
                }
                if (borderType === "all" || borderType === "outline" || borderType === "top") {
                  fmtRange.SetBorders("Top", "Thin", borderColor);
                }
                if (borderType === "all" || borderType === "outline" || borderType === "left") {
                  fmtRange.SetBorders("Left", "Thin", borderColor);
                }
                if (borderType === "all" || borderType === "outline" || borderType === "right") {
                  fmtRange.SetBorders("Right", "Thin", borderColor);
                }
                if (borderType === "all") {
                  fmtRange.SetBorders("InnerHorizontal", "Thin", borderColor);
                  fmtRange.SetBorders("InnerVertical", "Thin", borderColor);
                }
              }
            }

            // ── create_sheet ────────────────────────────
            else if (type === "create_sheet") {
              var newSheet = Api.AddSheet(String(a.name || "Sheet"));
              if (a.activate) {
                newSheet.SetActive();
              }
            }

            // ── insert_rows_columns ────────────────────
            else if (type === "insert_rows_columns") {
              var insertType = String(a.insertType || a.type || "row").toLowerCase();
              var insertIndex = parseInt(a.index, 10) || 0;
              var insertCount = parseInt(a.count, 10) || 1;

              if (insertType === "row") {
                // Select the range of entire rows, then Insert with "down" shift
                var insertRowStart = insertIndex + 1;
                var insertRowEnd = insertIndex + insertCount;
                var insertRowRange = "A" + insertRowStart + ":A" + insertRowEnd;
                sheet.GetRange(insertRowRange).GetEntireRow().Insert("down");
              } else if (insertType === "column") {
                var insertColStart = numberToCol(insertIndex + 1);
                var insertColEnd = numberToCol(insertIndex + insertCount);
                var insertColRange = insertColStart + "1:" + insertColEnd + "1";
                sheet.GetRange(insertColRange).GetEntireColumn().Insert("right");
              }
            }

            // ── delete_rows_columns ────────────────────
            else if (type === "delete_rows_columns") {
              var deleteType = String(a.deleteType || a.type || "row").toLowerCase();
              var deleteIndex = parseInt(a.index, 10) || 0;
              var deleteCount = parseInt(a.count, 10) || 1;

              if (deleteType === "row") {
                var delRowStart = deleteIndex + 1;
                var delRowEnd = deleteIndex + deleteCount;
                var delRowRange = "A" + delRowStart + ":A" + delRowEnd;
                sheet.GetRange(delRowRange).GetEntireRow().Delete("up");
              } else if (deleteType === "column") {
                var delColStart = numberToCol(deleteIndex + 1);
                var delColEnd = numberToCol(deleteIndex + deleteCount);
                var delColRange = delColStart + "1:" + delColEnd + "1";
                sheet.GetRange(delColRange).GetEntireColumn().Delete("left");
              }
            }

            // ── read_sheet ─────────────────────────────
            else if (type === "read_sheet") {
              var readTarget = sheet;
              if (a.sheet) {
                try { readTarget = Api.GetSheet(a.sheet); } catch (e) { readTarget = sheet; }
              }
              readTarget.SetActive();
              var usedRange = readTarget.GetUsedRange();
              if (usedRange) {
                usedRange.Select();
              }
            }

            // ── create_chart / edit_chart ────────────────────────────
            else if (type === "create_chart" || type === "create_line_chart" || type === "edit_chart" || type === "update_chart") {
              var chartSheet = sheet;
              var chartDataRange = String(a.dataRange || a.data_range || "A1:B5");
              var chartTypeStr = String(a.chartType || a.chart_type || "bar").toLowerCase();
              var targetTitle = a.title || a.chart_title || a.target_chart || "";

              // Map excelor chart types to OnlyOffice
              var ooChartType = "bar";
              if (chartTypeStr === "line" || type === "create_line_chart") ooChartType = "line";
              else if (chartTypeStr === "pie") ooChartType = "pie";
              else if (chartTypeStr === "area") ooChartType = "area";
              else if (chartTypeStr === "scatter" || chartTypeStr === "xy") ooChartType = "scatter";
              else if (chartTypeStr.indexOf("column") >= 0 || chartTypeStr === "bar") ooChartType = "bar";

              var isEdit = (type === "edit_chart" || type === "update_chart");
              var existingChart = null;
              var allCharts = chartSheet.GetAllCharts();

              // If editing, try to find the chart by title
              if (isEdit && targetTitle) {
                for (var ci = 0; ci < allCharts.length; ci++) {
                  // OnlyOffice API doesn't have a direct GetTitle() for charts unfortunately,
                  // but we can try to guess or just pick the first chart if title isn't strictly matched.
                  // For now, we update the first chart if we can't match title, or we just trust the index.
                  existingChart = allCharts[ci];
                  break; // Safest fallback in OnlyOffice SDKJS without strict title reading
                }
              }

              if (existingChart) {
                // Edit existing chart
                existingChart.SetData(chartSheet.GetRange(chartDataRange));
                if (targetTitle) existingChart.SetTitle(targetTitle, 12, false);
                // Changing type on existing chart isn't directly supported by a single method,
                // so we just update data and title.
              } else {
                // Create new chart
                var chartObj = Api.CreateChart(ooChartType, [
                  chartSheet.GetRange(chartDataRange)
                ], true, true);

                if (targetTitle) chartObj.SetTitle(targetTitle, 12, false);

                // Position: default or from params
                var posCell = a.position ? String(a.position) : "F2";
                var posRef = parseCell(posCell);

                var colOffset = posRef ? posRef.col * 20 : 100; // rough sizing
                var rowOffset = posRef ? posRef.row * 15 : 100;

                chartSheet.AddChart(chartDataRange, false, ooChartType, 2, colOffset * 36000, rowOffset * 36000, 400 * 36000, 300 * 36000);
              }
            }
          }
        }

        // ─── DOCUMENT ACTIONS ───────────────────────────
        function applyDocument(actions) {
          var doc = Api.GetDocument();

          for (var i = 0; i < actions.length; i++) {
            var a = actions[i] || {};
            var type = normalizeDocumentActionType(a.type);

            if (type === "insert_heading") {
              var hPara = Api.CreateParagraph();
              var level = Math.max(1, Math.min(6, parseInt(a.level, 10) || 1));
              hPara.SetStyle(Api.CreateStyle("Heading " + level, "paragraph"));
              hPara.AddText(String(a.text || ""));
              doc.Push(hPara);
            } else if (type === "insert_paragraph" || type === "insert_text") {
              var para = Api.CreateParagraph();
              var run = Api.CreateRun();
              run.AddText(String(a.text || ""));
              if (a.bold) run.SetBold(true);
              if (a.italic) run.SetItalic(true);
              if (a.fontSize) run.SetFontSize(parseInt(a.fontSize, 10) * 2);
              para.AddElement(run);
              doc.Push(para);
            } else if (type === "insert_table") {
              var data = Array.isArray(a.data) ? a.data : [];
              var nRows = parseInt(a.rows, 10) || data.length || 1;
              var nCols = parseInt(a.cols, 10) || (data[0] ? data[0].length : 1);
              var table = Api.CreateTable(nCols, nRows);
              for (var tr = 0; tr < data.length && tr < nRows; tr++) {
                var rowData = Array.isArray(data[tr]) ? data[tr] : [data[tr]];
                for (var tc = 0; tc < rowData.length && tc < nCols; tc++) {
                  var cell = table.GetCell(tr, tc);
                  var content = cell.GetContent();
                  var cp = Api.CreateParagraph();
                  cp.AddText(String(rowData[tc] != null ? rowData[tc] : ""));
                  content.Push(cp);
                }
              }
              doc.Push(table);
            } else if (type === "replace_text") {
              var search = doc.Search(String(a.find || ""), true);
              if (search && search.length) {
                for (var si = 0; si < search.length; si++) {
                  search[si].SetText(String(a.replace || ""));
                }
              }
            } else if (type === "insert_list") {
              var items = Array.isArray(a.items) ? a.items : [];
              var isNumbered = String(a.listType || a.type || "").toLowerCase() === "numbered";
              for (var li = 0; li < items.length; li++) {
                var listPara = Api.CreateParagraph();
                var prefix = isNumbered ? String(li + 1) + ". " : "• ";
                listPara.AddText(prefix + String(items[li] != null ? items[li] : ""));
                doc.Push(listPara);
              }
            } else if (type === "insert_page_break" || type === "format_text") {
              console.warn("[OnlyOffice plugin] Action requested but SDK bridge lacks a stable implementation:", type);
            } else {
              console.warn("[OnlyOffice plugin] Unknown document action type:", type);
            }
          }
        }

        // ─── PRESENTATION ACTIONS ───────────────────────
        function applyPresentation(actions) {
          var pres = Api.GetPresentation();

          for (var i = 0; i < actions.length; i++) {
            var a = actions[i] || {};
            var type = normalizePresentationActionType(a.type);

            if (type === "add_slide") {
              var slide = Api.CreateSlide();
              slide.RemoveAllObjects();
              pres.AddSlide(slide);
            } else if (type === "set_slide_title" || (type === "set_slide_text" && String(a.placeholder || "").toLowerCase() === "title")) {
              var idx = parseInt(a.slideIndex, 10) || 0;
              var sl = pres.GetSlideByIndex(idx);
              if (sl) {
                var titleShape = Api.CreateShape("rect", 600 * 36000, 56 * 36000);
                titleShape.SetPosition(60 * 36000, 30 * 36000);
                var titleContent = titleShape.GetDocContent();
                var tPara = Api.CreateParagraph();
                var tRun = Api.CreateRun();
                tRun.AddText(String(a.title || ""));
                tRun.SetFontSize(44);
                tRun.SetBold(true);
                tPara.AddElement(tRun);
                titleContent.Push(tPara);
                sl.AddObject(titleShape);
              }
            } else if (type === "set_slide_content" || type === "set_slide_text") {
              var ci = parseInt(a.slideIndex, 10) || 0;
              var cs = pres.GetSlideByIndex(ci);
              if (cs) {
                var contentShape = Api.CreateShape("rect", 600 * 36000, 300 * 36000);
                contentShape.SetPosition(60 * 36000, 100 * 36000);
                var cc = contentShape.GetDocContent();
                var lines = String(a.content || "").split("\n");
                for (var li = 0; li < lines.length; li++) {
                  var lp = Api.CreateParagraph();
                  lp.AddText(lines[li]);
                  cc.Push(lp);
                }
                cs.AddObject(contentShape);
              }
            } else if (type === "add_shape") {
              var si = parseInt(a.slideIndex, 10) || 0;
              var targetSlide = pres.GetSlideByIndex(si);
              if (!targetSlide) {
                console.warn("[OnlyOffice plugin] add_shape target slide not found:", si);
                continue;
              }
              var shapeWidth = (parseInt(a.width, 10) || 240) * 36000;
              var shapeHeight = (parseInt(a.height, 10) || 120) * 36000;
              var shape = Api.CreateShape(String(a.shapeType || "rect"), shapeWidth, shapeHeight);
              var shapeX = (parseInt(a.x, 10) || 80) * 36000;
              var shapeY = (parseInt(a.y, 10) || 120) * 36000;
              shape.SetPosition(shapeX, shapeY);
              var fillColor = String(a.fillColor || "").trim();
              if (/^#[0-9a-f]{6}$/i.test(fillColor) && shape.SetFill) {
                try {
                  shape.SetFill(Api.CreateSolidFill(Api.CreateRGBColor(
                    parseInt(fillColor.slice(1, 3), 16),
                    parseInt(fillColor.slice(3, 5), 16),
                    parseInt(fillColor.slice(5, 7), 16)
                  )));
                } catch (_shapeFillError) { }
              }
              targetSlide.AddObject(shape);
            } else if (type === "format_slide_text") {
              var fsi = parseInt(a.slideIndex, 10) || 0;
              var fslide = pres.GetSlideByIndex(fsi);
              if (!fslide) {
                console.warn("[OnlyOffice plugin] format_slide_text target slide not found:", fsi);
                continue;
              }
              var formatShape = Api.CreateShape("rect", 600 * 36000, 140 * 36000);
              formatShape.SetPosition(60 * 36000, 420 * 36000);
              var formatContent = formatShape.GetDocContent();
              var formatPara = Api.CreateParagraph();
              var formatRun = Api.CreateRun();
              formatRun.AddText(String(a.text || a.placeholder || "Formatted text"));
              if (a.bold) formatRun.SetBold(true);
              if (a.italic) formatRun.SetItalic(true);
              if (a.fontSize) formatRun.SetFontSize(parseInt(a.fontSize, 10) * 2);
              if (a.fontColor && /^#[0-9a-f]{6}$/i.test(String(a.fontColor || "")) && formatRun.SetColor) {
                try {
                  formatRun.SetColor(Api.CreateRGBColor(
                    parseInt(String(a.fontColor).slice(1, 3), 16),
                    parseInt(String(a.fontColor).slice(3, 5), 16),
                    parseInt(String(a.fontColor).slice(5, 7), 16)
                  ));
                } catch (_textColorError) { }
              }
              formatPara.AddElement(formatRun);
              formatContent.Push(formatPara);
              fslide.AddObject(formatShape);
            } else if (type === "delete_slide" || type === "duplicate_slide") {
              console.warn("[OnlyOffice plugin] Action requested but SDK bridge lacks a stable implementation:", type);
            } else {
              console.warn("[OnlyOffice plugin] Unknown presentation action type:", type);
            }
          }
        }

        // ─── PDF FORM ACTIONS ───────────────────────────
        function applyPdf(actions) {
          var doc = Api.GetDocument();

          for (var i = 0; i < actions.length; i++) {
            var a = actions[i] || {};
            var type = normalizePdfActionType(a.type);

            if (type === "add_text_field") {
              var tf = Api.CreateTextForm({
                key: String(a.key || "field_" + i),
                tip: String(a.placeholder || ""),
                required: false,
                placeholder: String(a.placeholder || "Enter text"),
                comb: false,
                maxCharacters: 0,
                cellWidth: 0,
                multiLine: false,
                autoFit: true,
              });
              var tfPara = Api.CreateParagraph();
              tfPara.AddElement(tf);
              doc.Push(tfPara);
            } else if (type === "add_checkbox") {
              var cb = Api.CreateCheckBoxForm({
                key: String(a.key || "check_" + i),
                tip: String(a.label || ""),
                required: false,
                isChecked: false,
              });
              var cbPara = Api.CreateParagraph();
              if (a.label) cbPara.AddText(String(a.label) + " ");
              cbPara.AddElement(cb);
              doc.Push(cbPara);
            } else if (type === "add_dropdown") {
              var opts = Array.isArray(a.options) ? a.options : [];
              var dd = Api.CreateComboBoxForm({
                key: String(a.key || "select_" + i),
                tip: "Select an option",
                required: false,
                placeholder: "Choose...",
                editable: false,
                autoFit: false,
                items: opts.map(function (o) { return String(o); }),
              });
              var ddPara = Api.CreateParagraph();
              ddPara.AddElement(dd);
              doc.Push(ddPara);
            } else if (type === "add_annotation") {
              var annotation = Api.CreateParagraph();
              annotation.AddText(String(a.text || ""));
              doc.Push(annotation);
            } else if (type === "add_stamp") {
              var stamp = Api.CreateParagraph();
              stamp.AddText("[STAMP] " + String(a.text || ""));
              doc.Push(stamp);
            } else if (type === "highlight_text") {
              var highlight = Api.CreateParagraph();
              highlight.AddText("[HIGHLIGHT] " + String(a.text || ""));
              doc.Push(highlight);
            } else if (type === "extract_text" || type === "summarize_page") {
              console.warn("[OnlyOffice plugin] Action requested but SDK bridge lacks a stable implementation:", type);
            } else {
              console.warn("[OnlyOffice plugin] Unknown PDF action type:", type);
            }
          }
        }

        // ─── Dispatch by editor type ────────────────────
        if (edType === "spreadsheet") {
          applySpreadsheet(actions);
        } else if (edType === "document") {
          applyDocument(actions);
        } else if (edType === "presentation") {
          applyPresentation(actions);
        } else if (edType === "pdf") {
          applyPdf(actions);
        } else {
          applySpreadsheet(actions);
        }
      },
      true,
      true,
      function () {
        el.message.textContent = "Actions applied successfully.";
      }
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  CLEAR
  // ═══════════════════════════════════════════════════════════

  function clearUi() {
    plannedActions = [];
    el.prompt.value = "";
    el.message.textContent = "";
    el.actions.textContent = "[]";
    setBusy(false);
  }

  // ═══════════════════════════════════════════════════════════
  //  INITIALIZATION
  // ═══════════════════════════════════════════════════════════

  window.Asc.plugin.init = async function () {
    el.backendUrl = q("backendUrl");
    el.prompt = q("prompt");
    el.message = q("message");
    el.actions = q("actions");
    el.planBtn = q("planBtn");
    el.applyBtn = q("applyBtn");
    el.clearBtn = q("clearBtn");

    // Detect editor type
    editorType = detectEditorType();

    var runtimeConfig = await loadRuntimeConfig();
    var savedUrl = loadSavedBackendUrl();
    var runtimeUrl = runtimeConfig && runtimeConfig.backendUrl ? String(runtimeConfig.backendUrl).trim() : "";
    if (savedUrl) {
      el.backendUrl.value = savedUrl;
    } else if (runtimeUrl) {
      el.backendUrl.value = runtimeUrl;
    }

    el.planBtn.addEventListener("click", generatePlan);
    el.applyBtn.addEventListener("click", applyPlan);
    el.clearBtn.addEventListener("click", clearUi);
    el.backendUrl.addEventListener("change", function () {
      saveBackendUrl(el.backendUrl.value.trim().replace(/\/$/, ""));
    });

    el.actions.textContent = "[]";
  };

  window.Asc.plugin.button = function () {
    this.executeCommand("close", "");
  };
})();
