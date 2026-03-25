import { useEffect, useMemo, useRef, useState } from "react";
import {
    AssistantRuntimeProvider,
    useLocalRuntime,
    CompositeAttachmentAdapter,
    SimpleImageAttachmentAdapter,
    SimpleTextAttachmentAdapter
} from "@assistant-ui/react";
import { PdfAttachmentAdapter } from "../lib/pdf-attachment-adapter";
import { streamExcelorAssistantTurn } from "../lib/excelor-streaming";
import { MyThread } from "./MyThread";
import { getAgentForContext } from "../data/agents";
import type { AgentConfig } from "../types/agent-types";

interface SidebarProps {
    documentContext: string;
    editorUrl: string;
    editorLoaded: boolean;
    editorFrameStatus?: 'idle' | 'assigned' | 'ready' | 'failed';
    editorFrameMessage?: string;
    isOpen: boolean;
    forceHidden?: boolean;
    showPdfContextPrompt?: boolean;
    onIncludePdfContext?: () => void;
    fullPdfTextRef?: React.MutableRefObject<string>;
    includeFullPdfContextRef?: React.MutableRefObject<boolean>;
    openPdf?: (path: string) => void;
}

const ONLYOFFICE_SCOPE: ExcelorScope = "onlyoffice";

function getFileSessionKey(editorUrl: string): string {
    const raw = String(editorUrl || "").trim();
    if (!raw) return "";
    try {
        const parsed = new URL(raw);
        const fileName = parsed.searchParams.get("fileName");
        if (fileName) return fileName;
        return parsed.toString();
    } catch {
        return raw;
    }
}

export function Sidebar({
    documentContext,
    editorUrl,
    editorLoaded,
    editorFrameStatus = 'idle',
    editorFrameMessage = '',
    isOpen,
    forceHidden = false,
    showPdfContextPrompt = false,
    onIncludePdfContext,
    fullPdfTextRef,
    includeFullPdfContextRef,
    openPdf,
}: SidebarProps) {
    const [isBusy, setIsBusy] = useState(false);
    const prevContextRef = useRef<string>(documentContext);
    const prevFileRef = useRef<string>(getFileSessionKey(editorUrl));
    const [threadKey, setThreadKey] = useState(0);

    // Auto-select agent based on documentContext
    const activeAgent: AgentConfig = useMemo(
        () => getAgentForContext(documentContext),
        [documentContext],
    );

    // Reset chat thread when the document context (agent) changes
    useEffect(() => {
        if (prevContextRef.current !== documentContext) {
            prevContextRef.current = documentContext;
            setThreadKey(k => k + 1);
        }
    }, [documentContext]);

    useEffect(() => {
        if (!window.electronAPI) return;
        void window.electronAPI.updateExcelorContext(ONLYOFFICE_SCOPE, {
            documentContext,
            editorLoaded,
            editorUrl,
            editorFrameStatus,
            editorFrameMessage,
        });
    }, [documentContext, editorFrameMessage, editorFrameStatus, editorLoaded, editorUrl]);

    useEffect(() => {
        if (!window.electronAPI) return;
        const nextFileKey = getFileSessionKey(editorUrl);
        if (prevFileRef.current === nextFileKey) return;
        prevFileRef.current = nextFileKey;
        if (!nextFileKey) return;

        setThreadKey((k) => k + 1);
        void window.electronAPI.updateExcelorContext(ONLYOFFICE_SCOPE, {
            documentContext,
            editorLoaded,
            editorUrl,
            editorFrameStatus,
            editorFrameMessage,
            resetThread: true,
        });
    }, [documentContext, editorFrameMessage, editorFrameStatus, editorLoaded, editorUrl]);

    const adapters = useMemo(() => ({
        attachments: new CompositeAttachmentAdapter([
            new SimpleImageAttachmentAdapter(),
            new SimpleTextAttachmentAdapter(),
            new PdfAttachmentAdapter(),
        ]),
    }), []);

    const runtime = useLocalRuntime({
        async *run({ messages }) {
            if (isBusy) return;
            setIsBusy(true);

            try {
                const requestedScope: ExcelorScope = documentContext === "pdf" ? "main" : ONLYOFFICE_SCOPE;
                yield* streamExcelorAssistantTurn({
                    messages,
                    requestedScope,
                    runtimeLabel: "onlyoffice runtime",
                    emptyPromptText: "Please enter a request.",
                    includeFullPdfContextRef: documentContext === "pdf" ? includeFullPdfContextRef : undefined,
                    fullPdfTextRef: documentContext === "pdf" ? fullPdfTextRef : undefined,
                });

            } catch (err: unknown) {
                yield {
                    content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
                };
            } finally {
                setIsBusy(false);
            }
        }
    }, {
        adapters
    });

    return (
        <aside id="right-sidebar" className={`right-sidebar chat-sidebar ${(!isOpen || forceHidden) ? 'hidden' : ''}`} style={{ display: 'flex', flexDirection: 'column' }}>

            {showPdfContextPrompt && onIncludePdfContext && (
                <div className="sidebar-context-prompt">
                    <p className="sidebar-context-prompt-title">Include full PDF context?</p>
                    <div className="sidebar-context-prompt-actions">
                        <button type="button" className="btn ghost" onClick={onIncludePdfContext}>Yes, include full PDF</button>
                    </div>
                </div>
            )}

            {/* ── Chat Thread ─────────────────────────── */}
            <div className="chat-history">
                <AssistantRuntimeProvider key={threadKey} runtime={runtime}>
                    <MyThread agentConfig={activeAgent} editorLoaded={editorLoaded} openPdf={openPdf} />
                </AssistantRuntimeProvider>
            </div>
        </aside>
    );
}
