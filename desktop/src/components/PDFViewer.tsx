import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

declare global {
  interface Window {
    pdfjsLib?: {
      getDocument: (opts: { data: Uint8Array }) => { promise: Promise<PDFDocumentProxy> };
      renderTextLayer: (opts: {
        textContent: unknown;
        container: HTMLElement;
        viewport: unknown;
      }) => { promise: Promise<void> };
      GlobalWorkerOptions: { workerSrc: string };
    };
  }
}

interface PDFDocumentProxy {
  numPages: number;
  getPage: (n: number) => Promise<PDFPageProxy>;
}

interface PDFPageProxy {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  getTextContent: () => Promise<{ items: Array<{ str: string }> }>;
  render: (ctx: unknown) => { promise: Promise<void> };
}

export interface PdfHighlightLocation {
  id: string;
  pageNumber: number;
  rect: { top: number; left: number; width: number; height: number } | null;
}

export interface PDFViewerRef {
  scrollToHighlight: (location: PdfHighlightLocation) => void;
  removeHighlight: (highlightId: string) => void;
}

interface PDFViewerProps {
  filePath: string;
  onFullTextExtracted?: (text: string) => void;
  onExplainSelection?: (text: string, style: string, location: PdfHighlightLocation) => void;
  pdfContentStyle?: React.CSSProperties;
}

const validFilePath = (fp: unknown): string =>
  fp && typeof fp === "string" ? fp : "";

export const PDFViewer = forwardRef<PDFViewerRef, PDFViewerProps>(
  function PDFViewer(
    { filePath, onFullTextExtracted, onExplainSelection, pdfContentStyle = {} },
    ref
  ) {
    const pathString = validFilePath(filePath);
    const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [initialPageLoaded, setInitialPageLoaded] = useState(false);
    const [totalPages, setTotalPages] = useState(0);
    const [scale, setScale] = useState(1.5);
    const [loading, setLoading] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [persistentHighlights, setPersistentHighlights] = useState<
      Array<{
        id: string;
        pageNumber: number;
        text: string;
        rectsOnPage: Array<{ top: number; left: number; width: number; height: number }>;
      }>
    >([]);
    const [pageRenderKey, setPageRenderKey] = useState(0);
    const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
    const [selectionTooltip, setSelectionTooltip] = useState({
      visible: false,
      text: "",
      x: 0,
      y: 0,
    });
    const [pageInputValue, setPageInputValue] = useState("");
    const [pageInputError, setPageInputError] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const selectedTextRef = useRef("");
    const pdfContentRef = useRef<HTMLDivElement>(null);
    const pdfDocumentRef = useRef<PDFDocumentProxy | null>(null);
    const currentPageRef = useRef(1);
    const totalPagesRef = useRef(0);

    const api = typeof window !== "undefined" ? window.electronAPI : null;

    useEffect(() => {
      if (!pathString || !api) return;
      let cancelled = false;
      const load = async () => {
        try {
          const stored = await api.getDocumentHighlights(pathString);
          if (!cancelled && Array.isArray(stored) && stored.length > 0) {
            setPersistentHighlights(
              stored.map((h: { id: string; pageNumber: number; text: string; rectsOnPage: unknown[] }) => ({
                id: String(h.id),
                pageNumber: Number(h.pageNumber),
                text: String(h.text ?? ""),
                rectsOnPage: (h.rectsOnPage as Array<{ top?: number; left?: number; width?: number; height?: number }> | undefined)?.map((r) => ({
                  top: Number(r.top ?? 0),
                  left: Number(r.left ?? 0),
                  width: Number(r.width ?? 0),
                  height: Number(r.height ?? 0),
                })) ?? [],
              }))
            );
          }
        } catch {
          if (!cancelled) setPersistentHighlights([]);
        }
      };
      load();
      return () => {
        cancelled = true;
      };
    }, [pathString, api]);

    useEffect(() => {
      if (!pathString || persistentHighlights.length === 0 || !api) return;
      const save = async () => {
        try {
          await api.saveDocumentHighlights(
            pathString,
            persistentHighlights.map((h) => ({
              id: h.id,
              pageNumber: h.pageNumber,
              text: h.text,
              rectsOnPage: h.rectsOnPage,
            }))
          );
        } catch (e) {
          console.error("Failed to save highlights", e);
        }
      };
      const t = setTimeout(save, 500);
      return () => clearTimeout(t);
    }, [pathString, persistentHighlights, api]);

    useEffect(() => {
      setInitialPageLoaded(false);
      setPdfDocument(null);
      setCurrentPage(1);
      setTotalPages(0);
      setLoading(false);
      setError(null);
      setLoadingStatus("");
      setPageRenderKey((k) => k + 1);
      setPersistentHighlights([]);
      setActiveHighlightId(null);
      setSelectionTooltip({ visible: false, text: "", x: 0, y: 0 });
      setPageInputValue("");
      setPageInputError("");
      pdfDocumentRef.current = null;
      currentPageRef.current = 1;
      totalPagesRef.current = 0;

      if (!pathString || !api) return;

      const pdfjsLib = window.pdfjsLib;
      if (!pdfjsLib) {
        setError("PDF.js library not found");
        return;
      }

      const loadPdf = async () => {
        setLoading(true);
        setLoadingStatus("Loading PDF...");
        if (onFullTextExtracted) onFullTextExtracted("");

        try {
          const base64Data = await api.readPdfFile(pathString);
          if (!base64Data || typeof base64Data !== "string") {
            throw new Error("Could not read PDF file");
          }
          const binary = atob(base64Data);
          const len = binary.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);

          const loadingTask = pdfjsLib.getDocument({ data: bytes });
          const document = await loadingTask.promise;
          setPdfDocument(document);
          setTotalPages(document.numPages);
          pdfDocumentRef.current = document;
          totalPagesRef.current = document.numPages;

          if (api) {
            try {
              const lastPage = await api.getLastViewedPage(pathString);
              if (lastPage > 1 && lastPage <= document.numPages) {
                setCurrentPage(lastPage);
                currentPageRef.current = lastPage;
              }
            } catch {
              setCurrentPage(1);
              currentPageRef.current = 1;
            }
          }
          setInitialPageLoaded(true);
          setLoadingStatus("");

          if (onFullTextExtracted) {
            setLoadingStatus("Extracting text...");
            let fullText = "";
            for (let i = 1; i <= document.numPages; i++) {
              const page = await document.getPage(i);
              const textContent = await page.getTextContent();
              fullText += textContent.items.map((item: { str: string }) => item.str).join(" ") + "\n\n";
            }
            onFullTextExtracted(fullText.trim());
            setLoadingStatus("");
          }

          setTimeout(() => pdfContentRef.current?.focus(), 100);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to load PDF");
          setLoadingStatus("Error loading PDF");
        } finally {
          setLoading(false);
        }
      };

      loadPdf();
    }, [pathString, onFullTextExtracted, api]);

    useEffect(() => {
      pdfDocumentRef.current = pdfDocument;
    }, [pdfDocument]);
    useEffect(() => {
      totalPagesRef.current = totalPages;
    }, [totalPages]);
    useEffect(() => {
      currentPageRef.current = currentPage;
    }, [currentPage]);

    useEffect(() => {
      if (!pathString || !initialPageLoaded || !api) return;
      const t = setTimeout(() => {
        api.saveLastViewedPage(pathString, currentPage);
      }, 500);
      return () => clearTimeout(t);
    }, [currentPage, pathString, initialPageLoaded, api]);

    useEffect(() => {
      if (!pdfContentRef.current) return;
      pdfContentRef.current.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }, [pathString, currentPage]);

    useEffect(() => {
      if (!pdfDocument || !containerRef.current) return;
      const pageContainer = containerRef.current;
      const canvasWrapper = document.createElement("div");
      canvasWrapper.className = "canvasWrapper";
      canvasWrapper.style.position = "relative";
      const canvas = document.createElement("canvas");
      canvasWrapper.appendChild(canvas);
      pageContainer.innerHTML = "";
      pageContainer.appendChild(canvasWrapper);

      setLoading(true);
      setLoadingStatus(`Rendering page ${currentPage}...`);

      pdfDocument
        .getPage(currentPage)
        .then(async (page) => {
          const viewport = page.getViewport({ scale });
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({ canvasContext: ctx, viewport }).promise;

          const textContent = await page.getTextContent();
          const textLayerDiv = document.createElement("div");
          textLayerDiv.className = "textLayer";
          textLayerDiv.style.cssText =
            "position:absolute;top:0;left:0;right:0;bottom:0;width:" +
            viewport.width +
            "px;height:" +
            viewport.height +
            "px;pointer-events:auto";
          canvasWrapper.appendChild(textLayerDiv);
          const pdfjsLib = window.pdfjsLib;
          if (pdfjsLib && pdfjsLib.renderTextLayer) {
            await pdfjsLib.renderTextLayer({
              textContent,
              container: textLayerDiv,
              viewport,
            }).promise;
          }
          setPageRenderKey((k) => k + 1);
        })
        .catch((e) => setError("Error rendering page: " + (e?.message ?? String(e))))
        .finally(() => {
          setLoading(false);
          setLoadingStatus("");
        });
    }, [pdfDocument, currentPage, scale]);

    useEffect(() => {
      if (!containerRef.current) return;
      const canvasWrapper = containerRef.current.querySelector(".canvasWrapper");
      if (!canvasWrapper) return;
      const old = canvasWrapper.querySelectorAll(".persistent-highlight");
      old.forEach((el) => el.remove());
      const forPage = persistentHighlights.filter((h) => h.pageNumber === currentPage);
      forPage.forEach((highlight) => {
        highlight.rectsOnPage.forEach((rect) => {
          const div = document.createElement("div");
          div.className = "persistent-highlight" + (highlight.id === activeHighlightId ? " active-scrolled-highlight" : "");
          div.setAttribute("data-highlight-id", highlight.id);
          div.style.cssText =
            "position:absolute;background:rgba(135,206,235,0.25);mix-blend-mode:multiply;pointer-events:none;border-radius:0.25em;z-index:0;" +
            `top:${rect.top * scale}px;left:${rect.left * scale}px;width:${rect.width * scale}px;height:${rect.height * scale}px`;
          canvasWrapper.appendChild(div);
        });
      });
    }, [persistentHighlights, currentPage, scale, activeHighlightId, pageRenderKey]);

    const handleSelectionChange = useCallback(() => {
      const sel = window.getSelection();
      const text = (sel?.toString() ?? "").trim();
      if (!text) return;
      selectedTextRef.current = text;
      const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
      if (range) {
        const rect = range.getBoundingClientRect();
        setSelectionTooltip({
          visible: true,
          text,
          x: rect.left + rect.width / 2,
          y: rect.top - 50,
        });
      }
    }, []);

    useEffect(() => {
      const onMouseUp = () => {
        const sel = window.getSelection();
        const text = (sel?.toString() ?? "").trim();
        if (!text) return;
        if (sel?.rangeCount) {
          const range = sel.getRangeAt(0);
          let node: Node | null = range.startContainer;
          if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
          if (node && (node as Element).closest?.(".textLayer")) handleSelectionChange();
        }
      };
      const onClick = (e: MouseEvent) => {
        if (tooltipRef.current?.contains(e.target as Node)) return;
        setTimeout(() => {
          if (!window.getSelection()?.toString()?.trim()) setSelectionTooltip((p) => ({ ...p, visible: false }));
        }, 100);
      };
      document.addEventListener("mouseup", onMouseUp);
      document.addEventListener("click", onClick);
      return () => {
        document.removeEventListener("mouseup", onMouseUp);
        document.removeEventListener("click", onClick);
      };
    }, [handleSelectionChange]);

    const handleAskAI = useCallback(
      (style: string) => {
        const sel = window.getSelection();
        const text = (selectedTextRef.current || selectionTooltip.text || "").trim();
        if (!text || !sel?.rangeCount) return;
        const range = sel.getRangeAt(0);
        const clientRects = Array.from(range.getClientRects());
        const canvasWrapper = containerRef.current?.querySelector(".canvasWrapper");
        if (!canvasWrapper || clientRects.length === 0) return;
        const wrapperRect = canvasWrapper.getBoundingClientRect();
        const rectsOnPage = clientRects.map((r) => ({
          top: (r.top - wrapperRect.top) / scale,
          left: (r.left - wrapperRect.left) / scale,
          width: r.width / scale,
          height: r.height / scale,
        }));
        const newHighlight = {
          id: Date.now().toString(),
          pageNumber: currentPage,
          text,
          rectsOnPage,
        };
        setPersistentHighlights((prev) => [...prev, newHighlight]);
        const location: PdfHighlightLocation = {
          id: newHighlight.id,
          pageNumber: currentPage,
          rect: rectsOnPage[0] ?? null,
        };
        setSelectionTooltip({ visible: false, text: "", x: 0, y: 0 });
        sel.removeAllRanges();
        setTimeout(() => {
          onExplainSelection?.(text, style, location);
        }, 100);
      },
      [currentPage, scale, selectionTooltip.text, onExplainSelection]
    );

    const goToPreviousPage = () => setCurrentPage((p) => Math.max(1, p - 1));
    const goToNextPage = () => setCurrentPage((p) => Math.min(totalPages, p + 1));
    const zoomIn = () => setScale((s) => s + 0.2);
    const zoomOut = () => setScale((s) => Math.max(0.5, s - 0.2));
    const goToPage = () => {
      const n = parseInt(pageInputValue, 10);
      if (isNaN(n) || n < 1 || n > totalPages) {
        setPageInputError(`Page must be 1–${totalPages}`);
        setTimeout(() => setPageInputError(""), 3000);
        return;
      }
      setCurrentPage(n);
      setPageInputValue("");
      setPageInputError("");
    };

    useImperativeHandle(
      ref,
      () => ({
        scrollToHighlight(locationData: PdfHighlightLocation) {
          if (!locationData?.id || locationData.pageNumber == null) return;
          const pageNum = Number(locationData.pageNumber);
          if (pageNum < 1 || pageNum > totalPages) return;
          const run = () => {
            const el = document.querySelector(`.persistent-highlight[data-highlight-id="${locationData.id}"]`);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              setActiveHighlightId(locationData.id);
              setTimeout(() => setActiveHighlightId(null), 2000);
            }
          };
          if (currentPage !== pageNum) {
            setCurrentPage(pageNum);
            setTimeout(run, 500);
          } else run();
        },
        removeHighlight(highlightId: string) {
          setPersistentHighlights((prev) => {
            const next = prev.filter((h) => h.id !== highlightId);
            if (pathString && api && next.length !== prev.length) {
              api.saveDocumentHighlights(
                pathString,
                next.map((h) => ({ id: h.id, pageNumber: h.pageNumber, text: h.text, rectsOnPage: h.rectsOnPage }))
              ).catch(() => {});
            }
            return next;
          });
        },
      }),
      [totalPages, currentPage, pathString, api]
    );

    if (!pathString) return null;

    return (
      <div style={{ display: "flex", flex: 1, flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden" }}>
        <style>{`
          .textLayer { position: absolute; left: 0; top: 0; right: 0; bottom: 0; overflow: hidden; opacity: 1; line-height: 1; user-select: text; z-index: 2; }
          .textLayer > span { color: transparent !important; font-family: Arial, sans-serif; position: absolute; white-space: pre; transform-origin: 0 0; }
          .textLayer .highlight::before { content: ''; position: absolute; inset: -1px; background: rgba(135,206,235,0.25); border-radius: 0.2em; pointer-events: none; }
          .persistent-highlight.active-scrolled-highlight { box-shadow: 0 0 0 2px rgba(135,206,235,0.8); }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
        <div
          style={{
            padding: "10px 15px",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            display: "flex",
            gap: "10px",
            alignItems: "center",
            backgroundColor: "rgba(255,255,255,0.05)",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={goToPreviousPage}
            disabled={currentPage <= 1 || loading}
            style={{ padding: "8px 12px", cursor: currentPage <= 1 ? "not-allowed" : "pointer", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "8px", color: "white" }}
          >
            ‹
          </button>
          <span style={{ color: "rgba(255,255,255,0.9)", fontSize: "0.9rem", minWidth: "60px" }}>
            {currentPage} / {totalPages || "?"}
          </span>
          <button
            type="button"
            onClick={goToNextPage}
            disabled={currentPage >= totalPages || loading}
            style={{ padding: "8px 12px", cursor: currentPage >= totalPages ? "not-allowed" : "pointer", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "8px", color: "white" }}
          >
            ›
          </button>
          <input
            type="number"
            value={pageInputValue}
            onChange={(e) => setPageInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && goToPage()}
            placeholder="Page"
            min={1}
            max={totalPages}
            style={{ width: "60px", padding: "6px 8px", marginLeft: "8px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "6px", color: "white", fontSize: "0.9rem" }}
          />
          <button type="button" onClick={goToPage} disabled={!pageInputValue} style={{ padding: "6px 10px", cursor: "pointer", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "6px", color: "white" }}>
            Go
          </button>
          {pageInputError && <span style={{ color: "#ff6b6b", fontSize: "0.8rem", marginLeft: "8px" }}>{pageInputError}</span>}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
            <button type="button" onClick={zoomOut} style={{ padding: "6px 10px", cursor: "pointer", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "6px", color: "white" }}>−</button>
            <span style={{ color: "rgba(255,255,255,0.9)", fontSize: "0.9rem", minWidth: "40px" }}>{Math.round(scale * 100)}%</span>
            <button type="button" onClick={zoomIn} style={{ padding: "6px 10px", cursor: "pointer", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "6px", color: "white" }}>+</button>
          </div>
        </div>
        {loadingStatus && (
          <div style={{ padding: "8px 15px", backgroundColor: "rgba(44,83,100,0.5)", borderBottom: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)", fontSize: "0.85rem", flexShrink: 0 }}>
            {loadingStatus}
          </div>
        )}
        <div
          ref={pdfContentRef}
          tabIndex={0}
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            backgroundColor: "#0c1821",
            padding: "20px",
            outline: "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            ...pdfContentStyle,
          }}
        >
          {loading && !pdfDocument ? (
            <div style={{ padding: "30px", color: "white" }}>{loadingStatus || "Loading..."}</div>
          ) : error ? (
            <div style={{ padding: "30px", color: "#ff6b6b" }}>
              <h3 style={{ margin: 0 }}>Error Loading PDF</h3>
              <p style={{ margin: "8px 0 0", opacity: 0.9 }}>{error}</p>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", width: "100%", minHeight: "100%" }}>
              <div
                ref={containerRef}
                style={{
                  backgroundColor: "white",
                  boxShadow: "0 4px 30px rgba(0,0,0,0.3)",
                  borderRadius: "8px",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              />
            </div>
          )}
          {selectionTooltip.visible && (
            <div
              ref={tooltipRef}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                left: selectionTooltip.x,
                top: selectionTooltip.y,
                width: "44px",
                height: "44px",
                background: "rgba(42,49,65,0.95)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: "50%",
                boxShadow: "0 6px 25px rgba(0,0,0,0.3)",
                color: "white",
                zIndex: 9999,
                transform: "translate(-50%, -50%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <button
                type="button"
                title="Explain selection"
                style={{ width: "100%", height: "100%", background: "transparent", border: "none", borderRadius: "50%", color: "white", cursor: "pointer", padding: 0 }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleAskAI("default");
                }}
              >
                💬
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
);
