import { useEffect, useMemo, useRef, useState } from "react";
import {
    AssistantRuntimeProvider,
    useLocalRuntime,
    CompositeAttachmentAdapter,
    SimpleImageAttachmentAdapter,
    SimpleTextAttachmentAdapter
} from "@assistant-ui/react";
import { MyThread } from "./MyThread";
import { getAgentForContext } from "../data/agents";
import type { AgentConfig } from "../types/agent-types";

interface SidebarProps {
    documentContext: string;
    editorUrl: string;
    editorLoaded: boolean;
    isOpen: boolean;
    forceHidden?: boolean;
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

export function Sidebar({ documentContext, editorUrl, editorLoaded, isOpen, forceHidden = false }: SidebarProps) {
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
        });
    }, [documentContext, editorLoaded, editorUrl]);

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
            resetThread: true,
        });
    }, [documentContext, editorLoaded, editorUrl]);

    const adapters = useMemo(() => ({
        attachments: new CompositeAttachmentAdapter([
            new SimpleImageAttachmentAdapter(),
            new SimpleTextAttachmentAdapter(),
        ]),
    }), []);

    const runtime = useLocalRuntime({
        async *run({ messages }) {
            if (isBusy) return;
            setIsBusy(true);

            try {
                const lastMessage = messages[messages.length - 1];
                const userText =
                    lastMessage?.content
                        .filter((c) => c.type === "text")
                        .map((c) => c.text)
                        .join("") ?? "";

                if (!userText.trim()) {
                    yield { content: [{ type: "text", text: "Please enter a request." }] };
                    return;
                }
                if (!window.electronAPI) {
                    yield { content: [{ type: "text", text: "Electron API not available." }] };
                    return;
                }

                type StreamItem =
                    | { type: "delta"; text: string }
                    | { type: "done"; answer: string }
                    | { type: "error"; message: string };

                const queue: StreamItem[] = [];
                let notifyQueue: (() => void) | null = null;
                const pushQueue = (item: StreamItem) => {
                    queue.push(item);
                    if (notifyQueue) {
                        const notify = notifyQueue;
                        notifyQueue = null;
                        notify();
                    }
                };
                const waitForQueue = () => new Promise<void>((resolve) => {
                    notifyQueue = resolve;
                });

                let settled = false;
                let launchedTurnId: string | null = null;
                let sawRunningSnapshot = false;
                let latestSnapshot: ExcelorSnapshot | null = null;
                let lastDraftText = "";
                let emittedText = "";
                const requestedScope: ExcelorScope = ONLYOFFICE_SCOPE;
                let acceptedScope: ExcelorScope = requestedScope;

                const finish = (item: StreamItem) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeout);
                    unsubscribe();
                    pushQueue(item);
                };

                const maybeEmitDraftDelta = (snapshot: ExcelorSnapshot) => {
                    if (!launchedTurnId) return;
                    if (snapshot.activeTurnId !== launchedTurnId) return;
                    const draft = String(snapshot.draftAssistantText || "");
                    if (!draft) {
                        lastDraftText = "";
                        return;
                    }
                    if (draft === lastDraftText) return;

                    const delta = draft.startsWith(lastDraftText)
                        ? draft.slice(lastDraftText.length)
                        : draft;
                    lastDraftText = draft;
                    if (delta) {
                        pushQueue({ type: "delta", text: delta });
                    }
                };

                const maybeComplete = (snapshot: ExcelorSnapshot) => {
                    latestSnapshot = snapshot;
                    maybeEmitDraftDelta(snapshot);

                    if (launchedTurnId && snapshot.activeTurnId === launchedTurnId) {
                        sawRunningSnapshot = true;
                    }
                    if (!launchedTurnId || !sawRunningSnapshot) return;
                    if (snapshot.status !== "idle" || snapshot.activeTurnId) return;

                    if (snapshot.lastError) {
                        finish({ type: "error", message: snapshot.lastError });
                        return;
                    }

                    const lastMsg = snapshot.messages[snapshot.messages.length - 1];
                    const answer = lastMsg?.role === "assistant" ? lastMsg.text : "";
                    finish({ type: "done", answer });
                };

                const timeout = setTimeout(
                    () => finish({ type: "error", message: "Excelor timed out after 120 seconds." }),
                    120_000,
                );

                const unsubscribe = window.electronAPI.onExcelorSnapshot((snapshot) => {
                    if (snapshot.scope !== acceptedScope) return;
                    maybeComplete(snapshot);
                });

                void window.electronAPI.excelorLaunch(userText, requestedScope)
                    .then((launchSnapshot) => {
                        if (launchSnapshot.scope !== acceptedScope) {
                            console.warn(
                                `[Excelor] Scope mismatch detected in onlyoffice runtime. Requested '${requestedScope}', received '${launchSnapshot.scope}'. Auto-recovering to '${launchSnapshot.scope}'.`,
                            );
                            acceptedScope = launchSnapshot.scope;
                        }
                        launchedTurnId = launchSnapshot.activeTurnId;
                        if (!launchedTurnId) {
                            throw new Error(launchSnapshot.lastError || "Excelor did not start a turn.");
                        }
                        if (latestSnapshot?.activeTurnId === launchedTurnId) {
                            sawRunningSnapshot = true;
                        }
                        maybeComplete(launchSnapshot);
                    })
                    .catch((error: unknown) => {
                        const message = error instanceof Error ? error.message : String(error);
                        finish({ type: "error", message });
                    });

                while (true) {
                    if (queue.length === 0) {
                        await waitForQueue();
                        continue;
                    }

                    const next = queue.shift();
                    if (!next) continue;

                    if (next.type === "delta") {
                        emittedText += next.text;
                        yield { content: [{ type: "text", text: next.text }] };
                        continue;
                    }

                    if (next.type === "error") {
                        if (!emittedText) {
                            yield { content: [{ type: "text", text: `Error: ${next.message}` }] };
                        }
                        return;
                    }

                    const answer = next.answer || "Excelor did not return a response.";
                    if (!emittedText) {
                        yield { content: [{ type: "text", text: answer }] };
                        return;
                    }

                    if (answer.startsWith(emittedText)) {
                        const suffix = answer.slice(emittedText.length);
                        if (suffix) {
                            yield { content: [{ type: "text", text: suffix }] };
                        }
                    } else if (answer && answer !== emittedText) {
                        yield { content: [{ type: "text", text: "\n\n" + answer }] };
                    }
                    return;
                }

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


            {/* ── Chat Thread ─────────────────────────── */}
            <div className="chat-history">
                <AssistantRuntimeProvider key={threadKey} runtime={runtime}>
                    <MyThread agentConfig={activeAgent} editorLoaded={editorLoaded} />
                </AssistantRuntimeProvider>
            </div>
        </aside>
    );
}
