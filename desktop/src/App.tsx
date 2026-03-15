import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AssistantRuntimeProvider, CompositeAttachmentAdapter, SimpleImageAttachmentAdapter, SimpleTextAttachmentAdapter, useLocalRuntime } from '@assistant-ui/react';
import { Titlebar, Dashboard, EXCELOR_AGENT_CONFIG } from './components/Dashboard';
import { Sidebar } from './components/Sidebar';
import { LeftSidebar } from './components/LeftSidebar';
import { MyThread } from './components/MyThread';
import { Settings } from './components/Settings';
import { ArrowLeft, ArrowRight, RotateCw, X, ExternalLink } from 'lucide-react';
import { executeAgentTool, type EditorCommand } from './lib/editor-tools';
import type { ToolExecutionResult } from './types/agent-types';
type CenterMode = 'dashboard' | 'browser' | 'editor' | 'settings';
type EditorFrameLoadStatus = 'idle' | 'assigned' | 'ready' | 'failed';

const DEFAULT_BROWSER_URL = 'https://www.google.com';
const MAIN_SCOPE: ExcelorScope = 'main';
const PRESENTATION_BRIDGE_READY_WAIT_MS = 2200;
const PRESENTATION_BRIDGE_READY_POLL_MS = 120;

function normalizeBrowserUrl(rawUrl: string): string {
    const trimmed = rawUrl.trim();
    if (!trimmed) return DEFAULT_BROWSER_URL;
    if (/^(https?:|file:|about:)/i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
}

export default function App() {
    const [servicesReady, setServicesReady] = useState(false);
    const [status, setStatus] = useState<ServiceStatus>({ backend: 'stopped', onlyoffice: 'stopped' });
    const [ports, setPorts] = useState<Ports>({ backend: 8090, onlyoffice: 8080, editorBridge: 0 });
    const [errorMsg, setErrorMsg] = useState('');

    const [editorUrl, setEditorUrl] = useState('');
    const [editorFrameStatus, setEditorFrameStatus] = useState<EditorFrameLoadStatus>('idle');
    const [editorFrameMessage, setEditorFrameMessage] = useState('');
    const [presentationBridgeWarning, setPresentationBridgeWarning] = useState('');
    const [isPresentationBridgeReady, setIsPresentationBridgeReady] = useState(false);
    const [documentContext, setDocumentContext] = useState('spreadsheet');
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const editorFrameHandshakeTimeoutRef = useRef<number | null>(null);

    const [centerMode, setCenterMode] = useState<CenterMode>('dashboard');
    const [isLeftOpen, setIsLeftOpen] = useState(true);
    const [isRightOpen, setIsRightOpen] = useState(true);
    const [isBrowserToolThreadDocked, setIsBrowserToolThreadDocked] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    const [address, setAddress] = useState(DEFAULT_BROWSER_URL);
    const [browserState, setBrowserState] = useState<BrowserState>({
        url: DEFAULT_BROWSER_URL,
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
    });
    const [isAddressFocused, setIsAddressFocused] = useState(false);
    const [excelorSnapshot, setExcelorSnapshot] = useState<ExcelorSnapshot | null>(null);
    const addressFocusRef = useRef(false);
    const browserHostRef = useRef<HTMLDivElement>(null);
    const browserToolActiveRef = useRef(false);
    const presentationBridgeReadyRef = useRef(false);
    const pendingPresentationToolRequestsRef = useRef(new Map<string, { resolve: (result: ToolExecutionResult) => void; timeoutId: number }>());
    const browserToolRestoreStateRef = useRef<{ centerMode: CenterMode; showSettings: boolean; isRightOpen: boolean }>({
        centerMode: 'dashboard',
        showSettings: false,
        isRightOpen: true,
    });

    const clearPendingPresentationToolRequests = useCallback((message: string) => {
        const pending = pendingPresentationToolRequestsRef.current;
        pending.forEach((entry) => {
            window.clearTimeout(entry.timeoutId);
            entry.resolve({ success: false, message });
        });
        pending.clear();
    }, []);

    const clearEditorFrameHandshake = useCallback(() => {
        if (editorFrameHandshakeTimeoutRef.current !== null) {
            window.clearTimeout(editorFrameHandshakeTimeoutRef.current);
            editorFrameHandshakeTimeoutRef.current = null;
        }
    }, []);

    const setEditorFrameState = useCallback((status: EditorFrameLoadStatus, message = '') => {
        setEditorFrameStatus(status);
        setEditorFrameMessage(message);
    }, []);

    useEffect(() => {
        presentationBridgeReadyRef.current = isPresentationBridgeReady;
    }, [isPresentationBridgeReady]);

    const waitForPresentationBridgeReady = useCallback(async () => {
        if (presentationBridgeReadyRef.current) {
            return true;
        }

        const startedAt = Date.now();
        while (Date.now() - startedAt < PRESENTATION_BRIDGE_READY_WAIT_MS) {
            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, PRESENTATION_BRIDGE_READY_POLL_MS);
            });
            if (presentationBridgeReadyRef.current) {
                return true;
            }
        }

        return presentationBridgeReadyRef.current;
    }, []);

    const handleEditorFrameLoad = useCallback(() => {
        setEditorFrameStatus((current) => {
            if (current === 'ready' || current === 'failed') {
                return current;
            }
            return 'assigned';
        });
        setEditorFrameMessage((current) => (
            current === '' || current === 'Opening OnlyOffice editor...'
                ? 'OnlyOffice editor page loaded. Waiting for startup handshake...'
                : current
        ));
    }, []);

    const handleEditorFrameError = useCallback(() => {
        clearEditorFrameHandshake();
        clearPendingPresentationToolRequests('The OnlyOffice editor failed before the presentation bridge returned a result.');
        setIsPresentationBridgeReady(false);
        setEditorFrameState('failed', 'The OnlyOffice editor frame failed to load.');
    }, [clearEditorFrameHandshake, clearPendingPresentationToolRequests, setEditorFrameState]);

    const dispatchPresentationToolCommand = useCallback(async (
        requestId: string,
        command: EditorCommand,
    ): Promise<ToolExecutionResult> => {
        if (editorFrameStatus !== 'ready') {
            return { success: false, message: 'OnlyOffice editor is still loading.' };
        }

        if (!presentationBridgeReadyRef.current) {
            await waitForPresentationBridgeReady();
        }

        const targetWindow = iframeRef.current?.contentWindow;
        if (!targetWindow) {
            return { success: false, message: 'Editor is not available - open a presentation first.' };
        }

        return await new Promise<ToolExecutionResult>((resolve) => {
            const timeoutId = window.setTimeout(() => {
                pendingPresentationToolRequestsRef.current.delete(requestId);
                resolve({ success: false, message: 'Timed out waiting for the OnlyOffice presentation bridge.' });
            }, 8000);

            pendingPresentationToolRequestsRef.current.set(requestId, { resolve, timeoutId });

            try {
                targetWindow.postMessage(
                    {
                        type: command.messageType,
                        requestId,
                        actions: command.actions,
                        action: command.action,
                        params: command.params,
                    },
                    '*',
                );
            } catch (err) {
                window.clearTimeout(timeoutId);
                pendingPresentationToolRequestsRef.current.delete(requestId);
                resolve({
                    success: false,
                    message: `Cannot reach the presentation bridge: ${err instanceof Error ? err.message : String(err)}`,
                    data: {
                        relayMode: 'host-postMessage',
                        retryAttempts: 0,
                    },
                });
            }
        });
    }, [editorFrameStatus, waitForPresentationBridgeReady]);

    const dispatchToolCommandToEditor = useCallback(async (
        request: ExcelorSubagentToolRequest,
        command: EditorCommand,
    ): Promise<ToolExecutionResult> => {
        if (request.contextType !== 'presentation') {
            return { success: false, message: 'Automation bridge unavailable for this editor context.' };
        }

        return await dispatchPresentationToolCommand(request.requestId, command);
    }, [dispatchPresentationToolCommand]);

    const excelorAdapters = useMemo(
        () => ({
            attachments: new CompositeAttachmentAdapter([
                new SimpleImageAttachmentAdapter(),
                new SimpleTextAttachmentAdapter(),
            ]),
        }),
        [],
    );

    const excelorRuntime = useLocalRuntime(
        useMemo(
            () => ({
                async *run({ messages }) {
                    const lastMessage = messages[messages.length - 1];
                    const userText =
                        lastMessage?.content
                            .filter((c: any) => c.type === 'text')
                            .map((c: any) => c.text)
                            .join('') ?? '';

                    if (!userText.trim()) {
                        yield { content: [{ type: 'text', text: 'Please enter a question.' }] };
                        return;
                    }

                    if (!window.electronAPI) {
                        yield { content: [{ type: 'text', text: 'Electron API not available.' }] };
                        return;
                    }

                    type StreamItem =
                        | { type: 'delta'; text: string }
                        | { type: 'done'; answer: string }
                        | { type: 'error'; message: string };

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
                    let lastDraftText = '';
                    let emittedText = '';
                    const requestedScope: ExcelorScope = MAIN_SCOPE;
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

                        const draft = String(snapshot.draftAssistantText || '');
                        if (!draft) {
                            lastDraftText = '';
                            return;
                        }

                        if (draft === lastDraftText) return;

                        let delta = '';
                        if (draft.startsWith(lastDraftText)) {
                            delta = draft.slice(lastDraftText.length);
                        } else {
                            delta = draft;
                        }
                        lastDraftText = draft;

                        if (delta) {
                            pushQueue({ type: 'delta', text: delta });
                        }
                    };

                    const maybeComplete = (snapshot: ExcelorSnapshot) => {
                        latestSnapshot = snapshot;
                        maybeEmitDraftDelta(snapshot);

                        if (launchedTurnId && snapshot.activeTurnId === launchedTurnId) {
                            sawRunningSnapshot = true;
                        }

                        if (!launchedTurnId || !sawRunningSnapshot) {
                            return;
                        }

                        if (snapshot.status !== 'idle' || snapshot.activeTurnId) {
                            return;
                        }

                        if (snapshot.lastError) {
                            finish({ type: 'error', message: snapshot.lastError });
                            return;
                        }

                        const lastMsg = snapshot.messages[snapshot.messages.length - 1];
                        const answer = lastMsg?.role === 'assistant' ? lastMsg.text : '';
                        finish({ type: 'done', answer });
                    };

                    const timeout = setTimeout(
                        () => finish({ type: 'error', message: 'Excelor timed out after 120 seconds.' }),
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
                                    `[Excelor] Scope mismatch detected in main runtime. Requested '${requestedScope}', received '${launchSnapshot.scope}'. Auto-recovering to '${launchSnapshot.scope}'.`,
                                );
                                acceptedScope = launchSnapshot.scope;
                            }
                            launchedTurnId = launchSnapshot.activeTurnId;
                            if (!launchedTurnId) {
                                throw new Error(launchSnapshot.lastError || 'Excelor did not start a turn.');
                            }

                            if (latestSnapshot?.activeTurnId === launchedTurnId) {
                                sawRunningSnapshot = true;
                            }

                            maybeComplete(launchSnapshot);
                        })
                        .catch((error: unknown) => {
                            const message = error instanceof Error ? error.message : String(error);
                            finish({ type: 'error', message });
                        });

                    while (true) {
                        if (queue.length === 0) {
                            await waitForQueue();
                            continue;
                        }

                        const next = queue.shift();
                        if (!next) continue;

                        if (next.type === 'delta') {
                            emittedText += next.text;
                            yield { content: [{ type: 'text', text: emittedText }] };
                            continue;
                        }

                        if (next.type === 'error') {
                            if (!emittedText) {
                                yield { content: [{ type: 'text', text: `Error: ${next.message}` }] };
                            } else {
                                yield { content: [{ type: 'text', text: emittedText + `\n\nError: ${next.message}` }] };
                            }
                            return;
                        }

                        const answer = next.answer || 'Excelor did not return a response.';
                        if (!emittedText) {
                            yield { content: [{ type: 'text', text: answer }] };
                            return;
                        }

                        if (answer.startsWith(emittedText)) {
                            const suffix = answer.slice(emittedText.length);
                            if (suffix) {
                                yield { content: [{ type: 'text', text: emittedText + suffix }] };
                            } else {
                                yield { content: [{ type: 'text', text: emittedText }] };
                            }
                        } else if (answer && answer !== emittedText) {
                            yield { content: [{ type: 'text', text: emittedText + '\n\n' + answer }] };
                        }
                        return;
                    }
                },
            }),
            [],
        ),
        {
            adapters: excelorAdapters,
        },
    );

    const activeCenterMode: CenterMode = showSettings
        ? 'settings'
        : centerMode === 'editor' && !editorUrl
            ? 'dashboard'
            : centerMode;

    useEffect(() => {
        addressFocusRef.current = isAddressFocused;
    }, [isAddressFocused]);

    useEffect(() => {
        if (status.backend === 'ready' && status.onlyoffice === 'ready') {
            setServicesReady(true);
        }
    }, [status]);

    useEffect(() => {
        if (!window.electronAPI) return;

        let isMounted = true;
        const unsubscribe = window.electronAPI.onExcelorSnapshot((snapshot) => {
            if (!isMounted) return;
            if (snapshot.scope !== MAIN_SCOPE) return;
            setExcelorSnapshot(snapshot);
        });

        void window.electronAPI.excelorBootstrap(MAIN_SCOPE).then((snapshot) => {
            if (!isMounted) return;
            if (snapshot.scope !== MAIN_SCOPE) return;
            setExcelorSnapshot(snapshot);
        }).catch(() => undefined);

        return () => {
            isMounted = false;
            unsubscribe?.();
        };
    }, []);

    useEffect(() => {
        if (!window.electronAPI) return;

        const unsubscribers = [
            window.electronAPI.onServiceStatus((s) => setStatus(s)),
            window.electronAPI.onPortsResolved((p) => setPorts(p)),
            window.electronAPI.onServicesReady(() => setServicesReady(true)),
            window.electronAPI.onServiceError((msg) => setErrorMsg(`Error: ${msg}`)),
            window.electronAPI.onNavigateEditor((url) => {
                setEditorUrl(url);
                setShowSettings(false);
                setCenterMode('editor');
                if (url.includes('.xlsx')) setDocumentContext('spreadsheet');
                else if (url.includes('.docx')) setDocumentContext('document');
                else if (url.includes('.pptx')) setDocumentContext('presentation');
                else if (url.includes('.pdf')) setDocumentContext('pdf');
            }),
            window.electronAPI.onBrowserStateChange((nextState) => {
                setBrowserState(nextState);
                if (!addressFocusRef.current) {
                    setAddress(nextState.url || DEFAULT_BROWSER_URL);
                }
            }),
        ];

        const loadInitialState = async () => {
            try {
                const initPorts = await window.electronAPI.getPorts();
                if (initPorts) {
                    setPorts(prev => {
                        if (
                            prev.backend === initPorts.backend
                            && prev.onlyoffice === initPorts.onlyoffice
                            && prev.editorBridge === initPorts.editorBridge
                        ) return prev;
                        return initPorts;
                    });
                }

                const initStatus = await window.electronAPI.getStatus();
                if (initStatus) {
                    setStatus(prev => {
                        if (prev.backend === initStatus.backend && prev.onlyoffice === initStatus.onlyoffice) return prev;
                        return initStatus;
                    });
                    if (initStatus.backend === 'ready' && initStatus.onlyoffice === 'ready') {
                        setServicesReady(true);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch initial status', err);
            }
        };

        void loadInitialState();

        const interval = setInterval(loadInitialState, 3000);
        return () => {
            clearInterval(interval);
            unsubscribers.forEach((unsubscribe) => unsubscribe?.());
        };
    }, []);

    useEffect(() => {
        if (!window.electronAPI) return;

        return window.electronAPI.onExcelorCloseRequested(() => {
            setCenterMode('dashboard');
        });
    }, []);

    useEffect(() => {
        if (!window.electronAPI) return;

        const unsubscribeFocus = window.electronAPI.onExcelorBrowserToolFocus(() => {
            if (!browserToolActiveRef.current) {
                browserToolRestoreStateRef.current = { centerMode, showSettings, isRightOpen };
            }
            browserToolActiveRef.current = true;
            setIsBrowserToolThreadDocked(true);
            setShowSettings(false);
            setIsRightOpen(true);
            setCenterMode('browser');
        });

        const unsubscribeRestore = window.electronAPI.onExcelorBrowserToolRestore(() => {
            if (!browserToolActiveRef.current) return;
            browserToolActiveRef.current = false;
            setIsBrowserToolThreadDocked(false);
            const restoreState = browserToolRestoreStateRef.current;
            setCenterMode(restoreState.centerMode);
            setShowSettings(restoreState.showSettings);
            setIsRightOpen(restoreState.isRightOpen);
        });

        return () => {
            unsubscribeFocus?.();
            unsubscribeRestore?.();
        };
    }, [centerMode, showSettings, isRightOpen]);

    useEffect(() => {
        if (!window.electronAPI) return;

        return window.electronAPI.onExcelorApplySubagentTool((request: ExcelorSubagentToolRequest) => {
            void (async () => {
                const result = await executeAgentTool(
                    request.contextType,
                    request.toolName,
                    request.args || {},
                    (command) => dispatchToolCommandToEditor(request, command),
                );
                window.electronAPI.respondExcelorSubagentTool(request.requestId, result);
            })();
        });
    }, [dispatchToolCommandToEditor]);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.source !== iframeRef.current?.contentWindow) return;

            const payload = event.data as {
                type?: string;
                documentType?: string;
                bridgeGuid?: string;
                requestId?: string;
                success?: boolean;
                message?: string;
                data?: unknown;
            };

            if (!payload || typeof payload.type !== 'string') {
                return;
            }

            if (payload.type === 'onlyoffice-editor-ready') {
                clearEditorFrameHandshake();
                setEditorFrameState('ready');
                return;
            }

            if (payload.type === 'presentation-bridge-ready') {
                setIsPresentationBridgeReady(true);
                setPresentationBridgeWarning('');
                return;
            }

            if (payload.type === 'onlyoffice-editor-error') {
                clearEditorFrameHandshake();
                clearPendingPresentationToolRequests('The OnlyOffice editor failed before the presentation bridge returned a result.');
                setIsPresentationBridgeReady(false);
                setEditorFrameState(
                    'failed',
                    typeof payload.message === 'string' && payload.message.trim()
                        ? payload.message
                        : 'OnlyOffice editor failed to initialize.',
                );
                return;
            }

            if (payload.type !== 'tool-result' || typeof payload.requestId !== 'string') {
                return;
            }

            if (typeof payload.message === 'string' && /presentation bridge plugin is not available/i.test(payload.message)) {
                setPresentationBridgeWarning(payload.message);
            }

            const pending = pendingPresentationToolRequestsRef.current.get(payload.requestId);
            if (!pending) return;

            window.clearTimeout(pending.timeoutId);
            pendingPresentationToolRequestsRef.current.delete(payload.requestId);
            pending.resolve({
                success: payload.success === true,
                message: typeof payload.message === 'string'
                    ? payload.message
                    : (payload.success === true ? 'Presentation tool completed.' : 'Presentation tool failed.'),
                data: payload.data,
            });
        };

        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
            clearPendingPresentationToolRequests('The presentation bridge listener was removed.');
        };
    }, [clearEditorFrameHandshake, clearPendingPresentationToolRequests, setEditorFrameState]);

    useEffect(() => {
        clearPendingPresentationToolRequests('The editor changed before the presentation bridge returned a result.');
        clearEditorFrameHandshake();
        setPresentationBridgeWarning('');
        setIsPresentationBridgeReady(false);

        if (!editorUrl) {
            setEditorFrameState('idle');
            return;
        }

        setEditorFrameState('assigned', 'Opening OnlyOffice editor...');
        editorFrameHandshakeTimeoutRef.current = window.setTimeout(() => {
            setEditorFrameState('failed', 'OnlyOffice editor did not complete its startup handshake.');
        }, 12000);
    }, [editorUrl, clearEditorFrameHandshake, clearPendingPresentationToolRequests, setEditorFrameState]);

    useEffect(() => {
        return () => {
            clearEditorFrameHandshake();
        };
    }, [clearEditorFrameHandshake]);

    useEffect(() => {
        if (!window.electronAPI) return;

        void window.electronAPI.updateExcelorContext(MAIN_SCOPE, {
            documentContext,
            editorLoaded: activeCenterMode === 'editor' && !!editorUrl,
            editorUrl,
        });
    }, [documentContext, activeCenterMode, editorUrl]);

    useEffect(() => {
        if (!window.electronAPI) return;

        if (activeCenterMode !== 'browser') {
            void window.electronAPI.browserHide();
            return;
        }

        const host = browserHostRef.current;
        if (!host) {
            void window.electronAPI.browserHide();
            return;
        }

        let frameId = 0;
        const syncBounds = () => {
            cancelAnimationFrame(frameId);
            frameId = window.requestAnimationFrame(() => {
                const rect = host.getBoundingClientRect();
                void window.electronAPI.browserShow({
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                });
            });
        };

        syncBounds();

        const observer = new ResizeObserver(syncBounds);
        observer.observe(host);
        window.addEventListener('resize', syncBounds);

        return () => {
            cancelAnimationFrame(frameId);
            observer.disconnect();
            window.removeEventListener('resize', syncBounds);
            void window.electronAPI.browserHide();
        };
    }, [activeCenterMode, isLeftOpen, isRightOpen, servicesReady]);

    const openEditor = (ext: string, isRecent = false, path = '') => {
        setDocumentContext(ext === 'docx' ? 'document' : ext === 'pptx' ? 'presentation' : ext === 'pdf' ? 'pdf' : 'spreadsheet');
        const editorOrigin = `http://localhost:${ports.onlyoffice}`;
        let url: string;
        if (path && path.startsWith('http')) {
            url = path;
        } else if (isRecent) {
            url = `${editorOrigin}/example/${path}`;
        } else {
            url = `${editorOrigin}/example/editor?fileExt=${ext}`;
        }
        setEditorUrl(url);
        setShowSettings(false);
        setCenterMode('editor');
    };

    const openBrowser = (nextUrl?: string) => {
        setShowSettings(false);
        setCenterMode('browser');
        const normalized = normalizeBrowserUrl(nextUrl || DEFAULT_BROWSER_URL);
        setAddress(normalized);
        void window.electronAPI.browserNavigate(normalized);
    };

    const toggleLeft = () => setIsLeftOpen(!isLeftOpen);
    const toggleRight = () => setIsRightOpen(!isRightOpen);

    const handleBrowserSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        openBrowser(address);
    };

    const closeEditor = () => {
        clearPendingPresentationToolRequests('The editor was closed before the presentation bridge returned a result.');
        clearEditorFrameHandshake();
        setPresentationBridgeWarning('');
        setEditorFrameState('idle');
        setEditorUrl('');
        setCenterMode('dashboard');
    };

    const renderBrowserPane = (extraClassName = '') => (
        <div className={`browser-pane ${extraClassName}`.trim()}>
            <div ref={browserHostRef} className="browser-host" />
        </div>
    );

    const renderCenterContent = () => {
        if (showSettings) {
            return <Settings onClose={() => setShowSettings(false)} ports={ports} />;
        }

        if (editorUrl && (activeCenterMode === 'browser' || activeCenterMode === 'editor')) {
            return (
                <div className="center-pane-stack">
                    {renderBrowserPane(activeCenterMode === 'browser' ? '' : 'hidden')}
                    <div id="editor-container" className={activeCenterMode === 'editor' ? '' : 'hidden'} style={{ position: 'relative' }}>
                        <button
                            className="editor-close-btn"
                            title="Close OnlyOffice"
                            onClick={closeEditor}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                        {(editorFrameMessage || presentationBridgeWarning) && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 16,
                                    left: 16,
                                    right: 56,
                                    zIndex: 4,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 8,
                                    pointerEvents: 'none',
                                }}
                            >
                                {editorFrameMessage && editorFrameStatus !== 'ready' && (
                                    <div
                                        style={{
                                            padding: '10px 12px',
                                            borderRadius: 10,
                                            background: editorFrameStatus === 'failed' ? 'rgba(127, 29, 29, 0.92)' : 'rgba(15, 23, 42, 0.86)',
                                            border: `1px solid ${editorFrameStatus === 'failed' ? 'rgba(248, 113, 113, 0.6)' : 'rgba(148, 163, 184, 0.35)'}`,
                                            color: '#f8fafc',
                                            fontSize: 13,
                                            lineHeight: 1.45,
                                            boxShadow: '0 12px 30px rgba(15, 23, 42, 0.28)',
                                        }}
                                    >
                                        {editorFrameMessage}
                                    </div>
                                )}
                                {presentationBridgeWarning && (
                                    <div
                                        style={{
                                            padding: '10px 12px',
                                            borderRadius: 10,
                                            background: 'rgba(120, 53, 15, 0.92)',
                                            border: '1px solid rgba(251, 191, 36, 0.55)',
                                            color: '#fef3c7',
                                            fontSize: 13,
                                            lineHeight: 1.45,
                                            boxShadow: '0 12px 30px rgba(120, 53, 15, 0.25)',
                                        }}
                                    >
                                        {presentationBridgeWarning}
                                    </div>
                                )}
                            </div>
                        )}
                        <iframe
                            ref={iframeRef}
                            id="editor-frame"
                            src={editorUrl}
                            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                            onLoad={handleEditorFrameLoad}
                            onError={handleEditorFrameError}
                        ></iframe>
                    </div>
                </div>
            );
        }

        if (activeCenterMode === 'browser') {
            return renderBrowserPane();
        }

        return <Dashboard ports={ports} openEditor={openEditor} subagents={excelorSnapshot?.subagents ?? []} />;
    };

    return (
        <>
            <Titlebar
                toggleLeft={toggleLeft}
                toggleRight={toggleRight}
                isLeftOpen={isLeftOpen}
                isRightOpen={isRightOpen}
                onOpenSettings={() => setShowSettings(true)}
                onOpenBrowser={() => openBrowser()}
            />

            {!servicesReady ? (
                <div id="loading-screen">
                    <div className="loader-container">
                        <div className="loader-spinner"></div>
                        <h2 className="loader-title">Starting Services</h2>
                        <p id="loader-status" className="loader-status">
                            {errorMsg || 'Waiting for backend & ONLYOFFICE...'}
                        </p>
                        <div className="loader-dots">
                            <span className="loader-dot">
                                <span className={`dot ${status.backend}`}></span> Backend
                            </span>
                            <span className="loader-dot">
                                <span className={`dot ${status.onlyoffice}`}></span> ONLYOFFICE
                            </span>
                        </div>
                        <div style={{ marginTop: '24px' }}>
                            <button className="btn ghost" onClick={() => setServicesReady(true)}>
                                Skip & Continue to App
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <AssistantRuntimeProvider runtime={excelorRuntime}>
                    <div id="app">
                        <LeftSidebar
                            ports={ports}
                            openEditor={openEditor}
                            isOpen={isLeftOpen}
                            onOpenSettings={() => setShowSettings(true)}
                        />

                        <main id="main-content">
                            {!showSettings && activeCenterMode === 'browser' && (
                                <div className="center-pane-toolbar">
                                    <form className="browser-toolbar" onSubmit={handleBrowserSubmit}>
                                        <button type="button" className="browser-icon-btn" onClick={() => void window.electronAPI.browserGoBack()} disabled={!browserState.canGoBack} title="Back">
                                            <ArrowLeft size={16} />
                                        </button>
                                        <button type="button" className="browser-icon-btn" onClick={() => void window.electronAPI.browserGoForward()} disabled={!browserState.canGoForward} title="Forward">
                                            <ArrowRight size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            className="browser-icon-btn"
                                            onClick={() => void (browserState.isLoading ? window.electronAPI.browserStop() : window.electronAPI.browserReload())}
                                            title={browserState.isLoading ? 'Stop' : 'Reload'}
                                        >
                                            {browserState.isLoading ? <X size={16} /> : <RotateCw size={16} />}
                                        </button>

                                        <div className="browser-address-container">
                                            <input
                                                className="browser-address-input"
                                                value={address}
                                                onChange={(event) => setAddress(event.target.value)}
                                                onFocus={() => setIsAddressFocused(true)}
                                                onBlur={() => setIsAddressFocused(false)}
                                                placeholder="Enter a URL"
                                            />
                                        </div>

                                        <button
                                            type="button"
                                            className="browser-icon-btn"
                                            onClick={() => void window.electronAPI.browserOpenExternal(normalizeBrowserUrl(browserState.url || address))}
                                            title="Open External"
                                        >
                                            <ExternalLink size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            className="browser-icon-btn"
                                            onClick={() => setCenterMode('dashboard')}
                                            title="Close Browser"
                                        >
                                            <X size={16} />
                                        </button>
                                    </form>
                                </div>
                            )}

                            <div className="center-pane-body">
                                {renderCenterContent()}
                            </div>
                        </main>

                        <Sidebar
                            documentContext={documentContext}
                            editorUrl={editorUrl}
                            editorLoaded={activeCenterMode === 'editor' && !!editorUrl}
                            isOpen={isRightOpen}
                            forceHidden={isBrowserToolThreadDocked}
                        />

                        {isBrowserToolThreadDocked && (
                            <aside
                                id="right-sidebar-docked-excelor"
                                className={`right-sidebar chat-sidebar ${!isRightOpen ? 'hidden' : ''}`}
                                style={{ display: 'flex', flexDirection: 'column' }}
                            >
                                <div className="chat-history">
                                    <MyThread agentConfig={EXCELOR_AGENT_CONFIG} editorLoaded={activeCenterMode === 'editor' && !!editorUrl} />
                                </div>
                                {(excelorSnapshot?.subagents?.length ?? 0) > 0 && (
                                    <div className="excelor-subagent-inline">
                                        {(excelorSnapshot?.subagents ?? []).map((subagent) => (
                                            <div key={subagent.id} className="excelor-subagent-inline-card">
                                                <div className="excelor-subagent-inline-head">
                                                    <strong>{subagent.nickname}</strong>
                                                    <span className={`excelor-subagent-pill status-${subagent.status}`}>{subagent.status}</span>
                                                </div>
                                                <p>{subagent.roleName} - depth {subagent.depth}</p>
                                                {subagent.lastError && <p className="error">{subagent.lastError}</p>}
                                                {!subagent.lastError && subagent.lastOutput && <p>{subagent.lastOutput}</p>}
                                                {!subagent.lastError && !subagent.lastOutput && subagent.lastMessage && <p>{subagent.lastMessage}</p>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </aside>
                        )}
                    </div>
                </AssistantRuntimeProvider>
            )}

            {servicesReady && (
                <footer id="statusbar">
                    <div className="status-left">
                        <span className="status-item">
                            <span className={`dot ${status.backend}`}></span> Backend
                        </span>
                        <span className="status-item">
                            <span className={`dot ${status.onlyoffice}`}></span> ONLYOFFICE
                        </span>
                    </div>
                    <div className="status-right">
                        <span id="status-port-info">Ports: {ports.backend} / {ports.onlyoffice}</span>
                    </div>
                </footer>
            )}
        </>
    );
}
