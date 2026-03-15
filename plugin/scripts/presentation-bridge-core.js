(function (global) {
  "use strict";

  function clonePlainValue(value) {
    try {
      return JSON.parse(JSON.stringify(value == null ? {} : value));
    } catch (_error) {
      return {};
    }
  }

  function normalizeResult(raw) {
    if (!raw) {
      return { success: false, message: "The OnlyOffice bridge returned no result." };
    }

    if (typeof raw === "string") {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          return {
            success: parsed.success === true,
            message: typeof parsed.message === "string"
              ? parsed.message
              : (parsed.success === true ? "Presentation tool completed." : "Presentation tool failed."),
            data: parsed.data,
          };
        }
      } catch (_error) {
        return { success: false, message: raw };
      }
    }

    if (typeof raw === "object") {
      return {
        success: raw.success === true,
        message: typeof raw.message === "string"
          ? raw.message
          : (raw.success === true ? "Presentation tool completed." : "Presentation tool failed."),
        data: raw.data,
      };
    }

    return { success: false, message: String(raw) };
  }

  function executePresentationRequest(payload, callback) {
    if (!global.Asc || !global.Asc.plugin || typeof global.Asc.plugin.callCommand !== "function") {
      callback({ success: false, message: "OnlyOffice plugin runtime is unavailable." });
      return;
    }

    global.Asc.scope.presentationBridgePayload = clonePlainValue(payload);

    global.Asc.plugin.callCommand(
      function () {
        var payload = Asc.scope.presentationBridgePayload || {};

        function finish(success, message, data) {
          return JSON.stringify({
            success: success === true,
            message: message || (success ? "Presentation tool completed." : "Presentation tool failed."),
            data: data,
          });
        }

        function toNumber(value, fallback) {
          var num = Number(value);
          return isFinite(num) ? num : fallback;
        }

        function mmToEmu(value) {
          return Math.round(toNumber(value, 0) * 36000);
        }

        function emuToMm(value) {
          return Number((toNumber(value, 0) / 36000).toFixed(2));
        }

        function createNoFill() {
          try {
            return Api.CreateNoFill();
          } catch (_error) {
            return undefined;
          }
        }

        function createStroke() {
          try {
            return Api.CreateStroke(0, createNoFill());
          } catch (_error) {
            return undefined;
          }
        }

        function isHexColor(value) {
          return /^#[0-9a-f]{6}$/i.test(String(value || ""));
        }

        function createRgbColor(hex) {
          if (!isHexColor(hex) || !Api.CreateRGBColor) return undefined;
          return Api.CreateRGBColor(
            parseInt(String(hex).slice(1, 3), 16),
            parseInt(String(hex).slice(3, 5), 16),
            parseInt(String(hex).slice(5, 7), 16)
          );
        }

        function createFill(hex) {
          if (!isHexColor(hex)) return createNoFill();
          try {
            return Api.CreateSolidFill(createRgbColor(hex));
          } catch (_error) {
            return createNoFill();
          }
        }

        function createShape(shapeType, widthMm, heightMm, fillColor) {
          var fill = createFill(fillColor);
          var stroke = createStroke();
          try {
            return Api.CreateShape(shapeType, mmToEmu(widthMm), mmToEmu(heightMm), fill, stroke);
          } catch (_error) {
            return Api.CreateShape(shapeType, mmToEmu(widthMm), mmToEmu(heightMm));
          }
        }

        function getPresentationOrThrow() {
          var presentation = Api.GetPresentation();
          if (!presentation) {
            throw new Error("Presentation API is unavailable.");
          }
          return presentation;
        }

        function getSlideCount(presentation) {
          if (presentation && typeof presentation.GetSlidesCount === "function") {
            return toNumber(presentation.GetSlidesCount(), 0);
          }
          if (presentation && typeof presentation.GetAllSlides === "function") {
            var slides = presentation.GetAllSlides() || [];
            return slides.length;
          }
          return 0;
        }

        function getSlideOrThrow(presentation, index) {
          var slideIndex = toNumber(index, -1);
          if (slideIndex < 0) {
            throw new Error("slide_index must be a non-negative number.");
          }
          var slide = presentation.GetSlideByIndex(slideIndex);
          if (!slide) {
            throw new Error("Slide " + slideIndex + " was not found.");
          }
          return { slide: slide, slideIndex: slideIndex };
        }

        function getDrawings(slide) {
          if (!slide || typeof slide.GetAllDrawings !== "function") return [];
          var drawings = slide.GetAllDrawings();
          return Array.isArray(drawings) ? drawings : [];
        }

        function getDrawingBounds(drawing) {
          return {
            left: emuToMm(drawing && typeof drawing.GetPosX === "function" ? drawing.GetPosX() : 0),
            top: emuToMm(drawing && typeof drawing.GetPosY === "function" ? drawing.GetPosY() : 0),
            width: emuToMm(drawing && typeof drawing.GetWidth === "function" ? drawing.GetWidth() : 0),
            height: emuToMm(drawing && typeof drawing.GetHeight === "function" ? drawing.GetHeight() : 0),
          };
        }

        function getDocContent(drawing) {
          if (!drawing || typeof drawing.GetDocContent !== "function") return null;
          try {
            return drawing.GetDocContent();
          } catch (_error) {
            return null;
          }
        }

        function getParagraphTexts(docContent) {
          if (!docContent || typeof docContent.GetAllParagraphs !== "function") return [];
          var paragraphs = docContent.GetAllParagraphs() || [];
          var texts = [];
          for (var i = 0; i < paragraphs.length; i++) {
            if (paragraphs[i] && typeof paragraphs[i].GetText === "function") {
              texts.push(String(paragraphs[i].GetText() || ""));
            }
          }
          return texts;
        }

        function getDrawingText(drawing) {
          var docContent = getDocContent(drawing);
          var text = "";
          if (docContent && typeof docContent.GetText === "function") {
            try {
              text = String(docContent.GetText() || "");
            } catch (_error) {
              text = "";
            }
          }
          return {
            text: text,
            paragraphs: getParagraphTexts(docContent),
          };
        }

        function getPlaceholderType(drawing) {
          try {
            var placeholder = drawing && typeof drawing.GetPlaceholder === "function" ? drawing.GetPlaceholder() : null;
            if (placeholder && typeof placeholder.GetType === "function") {
              return String(placeholder.GetType() || "");
            }
          } catch (_error) {
            return "";
          }
          return "";
        }

        function getShapeIdentifier(drawing, index) {
          if (drawing && typeof drawing.GetInternalId === "function") {
            try {
              var internalId = drawing.GetInternalId();
              if (internalId) return String(internalId);
            } catch (_error) {}
          }
          return String(index);
        }

        function choosePlaceholderTypes(rawPlaceholder) {
          var key = String(rawPlaceholder || "body").toLowerCase();
          var groups = {
            title: ["title", "ctrTitle"],
            subtitle: ["subTitle"],
            body: ["body", "obj", "chart", "table", "diagram"],
            footer: ["footer", "date", "sldNumber", "header"],
            picture: ["picture", "sldImage", "media", "clipArt"],
            chart: ["chart"],
          };
          if (groups[key]) return groups[key];
          return [key];
        }

        function findPlaceholderDrawing(slide, rawPlaceholder) {
          var placeholderTypes = choosePlaceholderTypes(rawPlaceholder);
          for (var i = 0; i < placeholderTypes.length; i++) {
            if (slide && typeof slide.GetDrawingsByPlaceholderType === "function") {
              var matches = slide.GetDrawingsByPlaceholderType(placeholderTypes[i]) || [];
              if (matches.length > 0) {
                return matches[0];
              }
            }
          }

          var drawings = getDrawings(slide);
          for (var j = 0; j < drawings.length; j++) {
            var drawing = drawings[j];
            var drawingPlaceholderType = String(getPlaceholderType(drawing) || "");
            if (placeholderTypes.indexOf(drawingPlaceholderType) >= 0) {
              return drawing;
            }
          }

          if (String(rawPlaceholder || "").toLowerCase() === "title") {
            var titleCandidate = null;
            var bestTop = Number.POSITIVE_INFINITY;
            for (var k = 0; k < drawings.length; k++) {
              var titleBounds = getDrawingBounds(drawings[k]);
              if (titleBounds.top < bestTop) {
                bestTop = titleBounds.top;
                titleCandidate = drawings[k];
              }
            }
            return titleCandidate;
          }

          return null;
        }

        function createPlaceholderDrawing(slide, rawPlaceholder) {
          var placeholderTypes = choosePlaceholderTypes(rawPlaceholder);
          var placeholderType = placeholderTypes[0] || "body";
          var layoutKey = String(rawPlaceholder || "body").toLowerCase();
          var bounds;
          if (layoutKey === "title") {
            bounds = { x: 18, y: 12, width: 220, height: 24 };
          } else if (layoutKey === "subtitle") {
            bounds = { x: 24, y: 42, width: 200, height: 18 };
          } else if (layoutKey === "footer") {
            bounds = { x: 18, y: 128, width: 120, height: 8 };
          } else {
            bounds = { x: 18, y: 40, width: 220, height: 76 };
          }
          var drawing = createShape("rect", bounds.width, bounds.height, null);
          drawing.SetPosition(mmToEmu(bounds.x), mmToEmu(bounds.y));
          if (typeof drawing.SetPlaceholder === "function" && typeof Api.CreatePlaceholder === "function") {
            try {
              drawing.SetPlaceholder(Api.CreatePlaceholder(placeholderType));
            } catch (_error) {}
          }
          slide.AddObject(drawing);
          return drawing;
        }

        function setParagraphAlignment(paragraph, alignment) {
          var value = String(alignment || "").toLowerCase();
          if (!value) return;
          try {
            if (typeof paragraph.SetJc === "function") {
              paragraph.SetJc(value);
              return;
            }
            if (typeof paragraph.SetAlign === "function") {
              paragraph.SetAlign(value);
            }
          } catch (_error) {}
        }

        function setTextOnDrawing(drawing, text, format) {
          var docContent = getDocContent(drawing);
          if (!docContent) {
            throw new Error("The target drawing does not contain editable text.");
          }

          if (typeof docContent.RemoveAllElements === "function") {
            docContent.RemoveAllElements();
          } else if (typeof docContent.GetElementsCount === "function" && typeof docContent.RemoveElement === "function") {
            for (var i = docContent.GetElementsCount() - 1; i >= 0; i--) {
              docContent.RemoveElement(i);
            }
          }

          var lines = String(text == null ? "" : text).split(/\r?\n/);
          if (lines.length === 0) lines = [""];

          for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            var paragraph = Api.CreateParagraph();
            setParagraphAlignment(paragraph, format && format.alignment);
            var run = Api.CreateRun();
            run.AddText(String(lines[lineIndex]));
            if (format && format.bold && typeof run.SetBold === "function") run.SetBold(true);
            if (format && format.italic && typeof run.SetItalic === "function") run.SetItalic(true);
            if (format && format.fontSize && typeof run.SetFontSize === "function") {
              run.SetFontSize(Math.max(14, toNumber(format.fontSize, 14)) * 2);
            }
            if (format && format.fontColor) {
              var fontColor = createRgbColor(format.fontColor);
              if (fontColor && typeof run.SetColor === "function") {
                try {
                  run.SetColor(fontColor);
                } catch (_error) {}
              }
            }
            paragraph.AddElement(run);
            docContent.Push(paragraph);
          }
        }

        function ensurePlaceholderText(slide, placeholder, text, format) {
          var drawing = findPlaceholderDrawing(slide, placeholder);
          if (!drawing) {
            drawing = createPlaceholderDrawing(slide, placeholder);
          }
          setTextOnDrawing(drawing, text, format || {});
          return drawing;
        }

        function normalizeShapeType(rawShapeType) {
          var key = String(rawShapeType || "rect");
          var map = {
            rectangle: "rect",
            roundedRectangle: "roundRect",
            circle: "ellipse",
            oval: "ellipse",
            lineArrow: "arrow",
            leftarrow: "leftArrow",
            rightarrow: "rightArrow",
            uparrow: "upArrow",
            downarrow: "downArrow",
          };
          return map[key] || map[key.toLowerCase()] || key;
        }

        function normalizeChartType(rawChartType) {
          var key = String(rawChartType || "bar").toLowerCase();
          var map = {
            column: "bar",
            columnclustered: "bar",
            bar: "bar",
            line: "line",
            area: "area",
            pie: "pie",
            donut: "doughnut",
            doughnut: "doughnut",
            scatter: "scatter",
          };
          return map[key] || key;
        }

        function buildListSlideShapes(slide, slideIndex) {
          var drawings = getDrawings(slide);
          var shapes = [];
          for (var i = 0; i < drawings.length; i++) {
            var drawing = drawings[i];
            var bounds = getDrawingBounds(drawing);
            var textInfo = getDrawingText(drawing);
            shapes.push({
              shapeId: getShapeIdentifier(drawing, i),
              index: i,
              type: drawing && typeof drawing.GetClassType === "function" ? String(drawing.GetClassType() || "drawing") : "drawing",
              name: getPlaceholderType(drawing) || "shape-" + i,
              left: bounds.left,
              top: bounds.top,
              width: bounds.width,
              height: bounds.height,
              textPreview: textInfo.text ? String(textInfo.text).slice(0, 120) : "",
            });
          }
          return {
            slideIndex: slideIndex,
            shapes: shapes,
          };
        }

        function findDrawingByShapeId(slide, shapeId) {
          var drawings = getDrawings(slide);
          var targetId = String(shapeId || "");
          for (var i = 0; i < drawings.length; i++) {
            if (getShapeIdentifier(drawings[i], i) === targetId || String(i) === targetId) {
              return { drawing: drawings[i], index: i };
            }
          }
          throw new Error("Shape '" + targetId + "' was not found on the slide.");
        }

        function getSlideBounds(presentation) {
          var width = presentation && typeof presentation.GetWidth === "function"
            ? presentation.GetWidth()
            : mmToEmu(254);
          var height = presentation && typeof presentation.GetHeight === "function"
            ? presentation.GetHeight()
            : mmToEmu(142.875);
          return { width: width, height: height };
        }

        function intersects(a, b) {
          return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
        }

        function buildVerifySlides(presentation) {
          var slideCount = getSlideCount(presentation);
          var presentationBounds = getSlideBounds(presentation);
          var overlaps = [];
          var overflows = [];
          var slides = [];

          for (var slideIndex = 0; slideIndex < slideCount; slideIndex++) {
            var slide = presentation.GetSlideByIndex(slideIndex);
            if (!slide) continue;
            var listResult = buildListSlideShapes(slide, slideIndex);
            slides.push({
              slideIndex: slideIndex,
              shapes: listResult.shapes,
            });

            for (var i = 0; i < listResult.shapes.length; i++) {
              var current = listResult.shapes[i];
              if (current.left < 0 || current.top < 0 || mmToEmu(current.left + current.width) > presentationBounds.width || mmToEmu(current.top + current.height) > presentationBounds.height) {
                overflows.push({
                  slideIndex: slideIndex,
                  shapeId: current.shapeId,
                  left: current.left,
                  top: current.top,
                  width: current.width,
                  height: current.height,
                });
              }

              for (var j = i + 1; j < listResult.shapes.length; j++) {
                var next = listResult.shapes[j];
                if (intersects(current, next)) {
                  overlaps.push({
                    slideIndex: slideIndex,
                    shapeId: current.shapeId,
                    otherShapeId: next.shapeId,
                  });
                }
              }
            }
          }

          return {
            overlaps: overlaps,
            overflows: overflows,
            slides: slides,
          };
        }

        function addSlideForLayout(presentation, action) {
          var layoutHint = String(action.layout || "blank");
          var insertIndex = action.position == null ? getSlideCount(presentation) : Math.max(0, toNumber(action.position, getSlideCount(presentation)));
          var slide = Api.CreateSlide();
          if (presentation && typeof presentation.AddSlide === "function") {
            presentation.AddSlide(slide, insertIndex);
          } else {
            presentation.AddSlide(slide);
          }

          var lowerLayout = layoutHint.toLowerCase();
          if (lowerLayout === "title" || lowerLayout === "titleonly") {
            createPlaceholderDrawing(slide, "title");
          } else if (lowerLayout === "titlecontent" || lowerLayout === "tx" || lowerLayout === "objandtx" || lowerLayout === "content") {
            createPlaceholderDrawing(slide, "title");
            createPlaceholderDrawing(slide, "body");
          } else if (lowerLayout === "twocolumn" || lowerLayout === "twocoltx" || lowerLayout === "comparison") {
            createPlaceholderDrawing(slide, "title");
            createPlaceholderDrawing(slide, "body");
            var second = createShape("rect", 102, 76, null);
            second.SetPosition(mmToEmu(132), mmToEmu(40));
            if (typeof second.SetPlaceholder === "function" && typeof Api.CreatePlaceholder === "function") {
              try {
                second.SetPlaceholder(Api.CreatePlaceholder("obj"));
              } catch (_error) {}
            }
            slide.AddObject(second);
          }

          return {
            slideIndex: insertIndex,
            layout: layoutHint,
          };
        }

        function duplicateSlide(presentation, slideIndex) {
          var source = getSlideOrThrow(presentation, slideIndex);
          var targetIndex = source.slideIndex + 1;
          if (source.slide && typeof source.slide.Duplicate === "function") {
            source.slide.Duplicate(targetIndex);
            return { sourceSlideIndex: source.slideIndex, slideIndex: targetIndex };
          }

          var clonedSlide = null;
          if (source.slide && typeof source.slide.ToJSON === "function" && typeof Api.FromJSON === "function") {
            clonedSlide = Api.FromJSON(source.slide.ToJSON());
          }
          if (!clonedSlide) {
            clonedSlide = Api.CreateSlide();
            var drawings = getDrawings(source.slide);
            for (var i = 0; i < drawings.length; i++) {
              var duplicateDrawing = null;
              if (typeof drawings[i].Copy === "function") {
                duplicateDrawing = drawings[i].Copy();
              } else if (typeof drawings[i].ToJSON === "function" && typeof Api.FromJSON === "function") {
                duplicateDrawing = Api.FromJSON(drawings[i].ToJSON());
              }
              if (duplicateDrawing) clonedSlide.AddObject(duplicateDrawing);
            }
          }
          presentation.AddSlide(clonedSlide, targetIndex);
          return { sourceSlideIndex: source.slideIndex, slideIndex: targetIndex };
        }

        function performWriteAction(presentation, action) {
          var type = String(action.type || "");
          if (type === "add_slide") {
            return addSlideForLayout(presentation, action);
          }
          if (type === "set_slide_text") {
            var slideTarget = getSlideOrThrow(presentation, action.slide_index);
            ensurePlaceholderText(slideTarget.slide, action.placeholder, action.text, {});
            return { slideIndex: slideTarget.slideIndex, placeholder: action.placeholder || "body" };
          }
          if (type === "format_slide_text") {
            var formatTarget = getSlideOrThrow(presentation, action.slide_index);
            var drawing = findPlaceholderDrawing(formatTarget.slide, action.placeholder);
            if (!drawing) {
              drawing = createPlaceholderDrawing(formatTarget.slide, action.placeholder);
            }
            var existing = getDrawingText(drawing);
            setTextOnDrawing(drawing, existing.text || String(action.placeholder || ""), {
              bold: action.bold,
              italic: action.italic,
              fontSize: action.font_size || action.fontSize,
              fontColor: action.font_color || action.fontColor,
              alignment: action.alignment,
            });
            return { slideIndex: formatTarget.slideIndex, placeholder: action.placeholder || "body" };
          }
          if (type === "delete_slide") {
            var deleteIndex = toNumber(action.slide_index, -1);
            if (deleteIndex < 0) throw new Error("slide_index must be provided for delete_slide.");
            presentation.RemoveSlides(deleteIndex, 1);
            return { slideIndex: deleteIndex };
          }
          if (type === "duplicate_slide") {
            return duplicateSlide(presentation, action.slide_index);
          }
          if (type === "add_shape") {
            var shapeTarget = getSlideOrThrow(presentation, action.slide_index);
            var shape = createShape(
              normalizeShapeType(action.shape_type || action.shapeType),
              toNumber(action.width, 40),
              toNumber(action.height, 20),
              action.fill_color || action.fillColor || null
            );
            shape.SetPosition(mmToEmu(toNumber(action.x, 20)), mmToEmu(toNumber(action.y, 20)));
            shapeTarget.slide.AddObject(shape);
            return {
              slideIndex: shapeTarget.slideIndex,
              shapeType: normalizeShapeType(action.shape_type || action.shapeType),
            };
          }
          if (type === "add_chart") {
            var chartTarget = getSlideOrThrow(presentation, action.slide_index);
            var series = Array.isArray(action.series) ? action.series : [];
            var numFormats = [];
            for (var si = 0; si < series.length; si++) {
              numFormats.push("General");
            }
            var chart = Api.CreateChart(
              normalizeChartType(action.chart_type || action.chartType),
              series,
              Array.isArray(action.series_names || action.seriesNames) ? (action.series_names || action.seriesNames) : [],
              Array.isArray(action.category_names || action.categoryNames) ? (action.category_names || action.categoryNames) : [],
              mmToEmu(toNumber(action.width, 120)),
              mmToEmu(toNumber(action.height, 70)),
              24,
              numFormats
            );
            chart.SetPosition(mmToEmu(toNumber(action.x, 20)), mmToEmu(toNumber(action.y, 45)));
            if (action.title && typeof chart.SetTitle === "function") {
              chart.SetTitle(String(action.title), 26, false);
            }
            chartTarget.slide.AddObject(chart);
            return { slideIndex: chartTarget.slideIndex };
          }
          if (type === "insert_image") {
            var imageTarget = getSlideOrThrow(presentation, action.slide_index);
            var image = Api.CreateImage(
              String(action.url || ""),
              mmToEmu(toNumber(action.width, 80)),
              mmToEmu(toNumber(action.height, 45))
            );
            if (!image) {
              throw new Error("OnlyOffice could not create the image object. The URL may be unreachable from the document server.");
            }
            image.SetPosition(mmToEmu(toNumber(action.x, 20)), mmToEmu(toNumber(action.y, 20)));
            imageTarget.slide.AddObject(image);
            return { slideIndex: imageTarget.slideIndex, url: String(action.url || "") };
          }
          throw new Error("Unsupported presentation action: " + type);
        }

        function performReadAction(presentation, actionName, params) {
          if (actionName === "list_slide_shapes") {
            var listTarget = getSlideOrThrow(presentation, params.slide_index);
            return buildListSlideShapes(listTarget.slide, listTarget.slideIndex);
          }
          if (actionName === "read_slide_text") {
            var readTarget = getSlideOrThrow(presentation, params.slide_index);
            var located = findDrawingByShapeId(readTarget.slide, params.shape_id);
            var textInfo = getDrawingText(located.drawing);
            return {
              slideIndex: readTarget.slideIndex,
              shapeId: getShapeIdentifier(located.drawing, located.index),
              text: textInfo.text,
              paragraphs: textInfo.paragraphs,
            };
          }
          if (actionName === "verify_slides") {
            return buildVerifySlides(presentation);
          }
          if (actionName === "screenshot_slide") {
            return {
              success: false,
              message: "screenshotSlide is not supported by the current OnlyOffice bridge.",
              data: {
                reason: "not_supported",
                slideIndex: params.slide_index,
              },
            };
          }
          throw new Error("Unsupported presentation read action: " + actionName);
        }

        try {
          var presentation = getPresentationOrThrow();
          if (String(payload.type || "") === "request-read") {
            var readResult = performReadAction(presentation, String(payload.action || ""), payload.params || {});
            if (readResult && readResult.success === false) {
              return finish(false, readResult.message, readResult.data);
            }
            return finish(true, "Presentation read completed.", readResult);
          }

          var actions = Array.isArray(payload.actions) ? payload.actions : [];
          if (actions.length === 0) {
            throw new Error("No presentation actions were provided.");
          }

          var results = [];
          for (var actionIndex = 0; actionIndex < actions.length; actionIndex++) {
            results.push(performWriteAction(presentation, actions[actionIndex] || {}));
          }
          return finish(true, "Presentation actions applied.", { results: results });
        } catch (error) {
          return finish(false, error && error.message ? error.message : String(error));
        }
      },
      true,
      true,
      function (rawResult) {
        callback(normalizeResult(rawResult));
      }
    );
  }

  function createToolResultPayload(message, result) {
    return {
      type: "tool-result",
      requestId: message.requestId,
      success: result && result.success === true,
      message: result && typeof result.message === "string"
        ? result.message
        : (result && result.success === true ? "Presentation tool completed." : "Presentation tool failed."),
      data: result ? result.data : undefined,
    };
  }

  function attachMessageBridge() {
    global.addEventListener("message", function (event) {
      var message = event && event.data;
      if (!message || (message.type !== "apply-actions" && message.type !== "request-read")) {
        return;
      }
      if (!message.requestId) {
        return;
      }

      executePresentationRequest(message, function (result) {
        try {
          global.parent.postMessage(createToolResultPayload(message, result), "*");
        } catch (_error) {
          // Ignore relay failures.
        }
      });
    });
  }

  global.PresentationBridgeCore = {
    executePresentationRequest: executePresentationRequest,
    attachMessageBridge: attachMessageBridge,
    normalizeResult: normalizeResult,
  };
})(window);
