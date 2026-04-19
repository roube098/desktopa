import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { InlineMcpAppEntry } from './types/inline-mcp-app';
import { AssistantRuntimeProvider, CompositeAttachmentAdapter, SimpleImageAttachmentAdapter, SimpleTextAttachmentAdapter, useLocalRuntime } from '@assistant-ui/react';
import { PdfAttachmentAdapter } from './lib/pdf-attachment-adapter';
import { Titlebar, Dashboard, EXCELOR_AGENT_CONFIG } from './components/Dashboard';
import { Sidebar } from './components/Sidebar';
import { LeftSidebar } from './components/LeftSidebar';
import { MyThread } from './components/MyThread';
import { Settings } from './components/Settings';
import { McpAppPane } from './components/McpAppPane';
import { ArrowLeft, ArrowRight, RotateCw, X, ExternalLink } from 'lucide-react';
import { streamExcelorAssistantTurn } from './lib/excelor-streaming';
type CenterMode = 'dashboard' | 'browser' | 'editor' | 'settings' | 'mcpApp';
type EditorFrameLoadStatus = 'idle' | 'assigned' | 'ready' | 'failed';

const DEFAULT_BROWSER_URL = 'https://www.google.com';
const MAIN_SCOPE: ExcelorScope = 'main';

const EMPTY_INLINE_MCP_APPS: InlineMcpAppEntry[] = [];

function isTldrawAppState(appState: McpAppState | null | undefined): boolean {
    return appState?.builtInAppId?.toLowerCase() === 'tldraw';
}

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
    const [documentContext, setDocumentContext] = useState('spreadsheet');
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const editorFrameHandshakeTimeoutRef = useRef<number | null>(null);

    const [centerMode, setCenterMode] = useState<CenterMode>('dashboard');
    const [isLeftOpen, setIsLeftOpen] = useState(true);
    const [isRightOpen, setIsRightOpen] = useState(false);
    const [isBrowserToolThreadDocked, setIsBrowserToolThreadDocked] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    const [address, setAddress] = useState(DEFAULT_BROWSER_URL);
    const [browserState, setBrowserState] = useState<BrowserState>({
        url: DEFAULT_BROWSER_URL,
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
    });
    const [activeMcpApp, setActiveMcpApp] = useState<McpAppState | null>(null);
    const [isAddressFocused, setIsAddressFocused] = useState(false);
    const [excelorSnapshot, setExcelorSnapshot] = useState<ExcelorSnapshot | null>(null);
    const [mainThreadKey, setMainThreadKey] = useState(0);
    const [fullPdfText, setFullPdfText] = useState('');
    const fullPdfTextRef = useRef('');
    const includeFullPdfContextRef = useRef(false);
    useEffect(() => {
        fullPdfTextRef.current = fullPdfText;
    }, [fullPdfText]);
    const addressFocusRef = useRef(false);
    const browserHostRef = useRef<HTMLDivElement>(null);
    const browserToolActiveRef = useRef(false);
    const browserToolRestoreStateRef = useRef<{ centerMode: CenterMode; showSettings: boolean; isRightOpen: boolean }>({
        centerMode: 'dashboard',
        showSettings: false,
        isRightOpen: false,
    });

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
        setEditorFrameState('failed', 'The OnlyOffice editor frame failed to load.');
    }, [clearEditorFrameHandshake, setEditorFrameState]);

    const excelorAdapters = useMemo(
        () => ({
            attachments: new CompositeAttachmentAdapter([
                new SimpleImageAttachmentAdapter(),
                new SimpleTextAttachmentAdapter(),
                new PdfAttachmentAdapter(),
            ]),
        }),
        [],
    );

    const excelorRuntime = useLocalRuntime(
        useMemo(
            () => ({
                async *run({ messages, abortSignal }) {
                    yield* streamExcelorAssistantTurn({
                        messages,
                        requestedScope: MAIN_SCOPE,
                        runtimeLabel: 'main runtime',
                        emptyPromptText: 'Please enter a question.',
                        includeFullPdfContextRef,
                        fullPdfTextRef,
                        abortSignal,
                    });
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
            : centerMode === 'mcpApp' && !activeMcpApp
                ? 'dashboard'
            : centerMode;
    const isTldrawAppActive = Boolean(activeMcpApp && isTldrawAppState(activeMcpApp));

    const handleNewChat = useCallback(async () => {
        if (!window.electronAPI) return;
        await window.electronAPI.updateExcelorContext(MAIN_SCOPE, {
            documentContext,
            editorLoaded: activeCenterMode === 'editor' && !!editorUrl,
            editorUrl,
            resetThread: true,
        });
        setMainThreadKey((k) => k + 1);
    }, [documentContext, activeCenterMode, editorUrl]);

    const rightPaneApplicable = !isTldrawAppActive && (
        activeCenterMode === 'browser'
        || activeCenterMode === 'editor'
        || activeCenterMode === 'mcpApp'
    );
    const effectiveRightOpen = isRightOpen && rightPaneApplicable;

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
        const unsubscribeSnapshot = window.electronAPI.onExcelorSnapshot((snapshot) => {
            if (!isMounted) return;
            if (snapshot.scope !== MAIN_SCOPE) return;
            setExcelorSnapshot(snapshot);
        });
        const unsubscribeMcpApp = window.electronAPI.onMcpAppStateChange((state) => {
            if (!isMounted) return;
            setActiveMcpApp(state);
            if (state) {
                setShowSettings(false);
                if (isTldrawAppState(state)) {
                    setCenterMode('dashboard');
                    setIsRightOpen(false);
                } else {
                    setCenterMode('mcpApp');
                    setIsRightOpen(true);
                }
            } else {
                setCenterMode((current) => current === 'mcpApp' ? 'dashboard' : current);
            }
        });

        void window.electronAPI.excelorBootstrap(MAIN_SCOPE).then((snapshot) => {
            if (!isMounted) return;
            if (snapshot.scope !== MAIN_SCOPE) return;
            setExcelorSnapshot(snapshot);
        }).catch(() => undefined);
        void window.electronAPI.getActiveMcpApp().then((state) => {
            if (!isMounted) return;
            setActiveMcpApp(state);
            if (state) {
                if (isTldrawAppState(state)) {
                    setCenterMode('dashboard');
                    setIsRightOpen(false);
                } else {
                    setCenterMode('mcpApp');
                    setIsRightOpen(true);
                }
            }
        }).catch(() => undefined);

        return () => {
            isMounted = false;
            unsubscribeSnapshot?.();
            unsubscribeMcpApp?.();
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
                setIsRightOpen(true);
                if (url.includes('.xlsx')) setDocumentContext('spreadsheet');
                else if (url.includes('.docx')) setDocumentContext('document');
                else if (url.includes('.pptx')) setDocumentContext('presentation');
                else if (url.includes('.pdf')) setDocumentContext('pdf');
                if (!url.includes('.pdf')) setFullPdfText('');
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
            setIsRightOpen(false);
        });
    }, []);

    useEffect(() => {
        if (!isTldrawAppActive) return;
        setIsRightOpen(false);
    }, [isTldrawAppActive]);

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
            const message = request.contextType === 'presentation'
                ? 'The legacy OnlyOffice presentation automation bridge has been removed. Use Dexter PowerPoint tools to generate and edit decks.'
                : 'Embedded OnlyOffice editor automation is unavailable in this desktop renderer.';
            window.electronAPI.respondExcelorSubagentTool(request.requestId, {
                success: false,
                message,
            });
        });
    }, []);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.source !== iframeRef.current?.contentWindow) return;

            const payload = event.data as {
                type?: string;
                documentType?: string;
                message?: string;
            };

            if (!payload || typeof payload.type !== 'string') {
                return;
            }

            if (payload.type === 'onlyoffice-editor-ready') {
                clearEditorFrameHandshake();
                setEditorFrameState('ready');
                return;
            }

            if (payload.type === 'onlyoffice-editor-error') {
                clearEditorFrameHandshake();
                setEditorFrameState(
                    'failed',
                    typeof payload.message === 'string' && payload.message.trim()
                        ? payload.message
                        : 'OnlyOffice editor failed to initialize.',
                );
            }
        };

        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [clearEditorFrameHandshake, setEditorFrameState]);

    useEffect(() => {
        clearEditorFrameHandshake();

        if (!editorUrl) {
            setEditorFrameState('idle');
            return;
        }

        setEditorFrameState('assigned', 'Opening OnlyOffice editor...');
        editorFrameHandshakeTimeoutRef.current = window.setTimeout(() => {
            setEditorFrameState('failed', 'OnlyOffice editor did not complete its startup handshake.');
        }, 12000);
    }, [editorUrl, clearEditorFrameHandshake, setEditorFrameState]);

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
    }, [activeCenterMode, isLeftOpen, effectiveRightOpen, servicesReady]);

    const openEditor = (ext: string, isRecent = false, path = '', pdfSourcePath?: string) => {
        setDocumentContext(ext === 'docx' ? 'document' : ext === 'pptx' ? 'presentation' : ext === 'pdf' ? 'pdf' : 'spreadsheet');
        if (ext === 'pdf') {
            if (pdfSourcePath && window.electronAPI) {
                void window.electronAPI.extractPdfText(pdfSourcePath).then((r) => {
                    if (r.text) setFullPdfText(r.text);
                });
            } else {
                setFullPdfText('');
            }
        } else {
            setFullPdfText('');
        }
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
        setIsRightOpen(true);
    };

    const openBrowser = (nextUrl?: string) => {
        setShowSettings(false);
        setCenterMode('browser');
        setIsRightOpen(true);
        const normalized = normalizeBrowserUrl(nextUrl || DEFAULT_BROWSER_URL);
        setAddress(normalized);
        void window.electronAPI.browserNavigate(normalized);
    };

    const toggleLeft = () => setIsLeftOpen(!isLeftOpen);
    const toggleRight = () => {
        if (!rightPaneApplicable) return;
        setIsRightOpen(!isRightOpen);
    };

    const handleBrowserSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        openBrowser(address);
    };

    const closeEditor = () => {
        clearEditorFrameHandshake();
        setEditorFrameState('idle');
        setEditorUrl('');
        setFullPdfText('');
        setCenterMode('dashboard');
        setIsRightOpen(false);
    };

    const closeMcpApp = useCallback(async () => {
        if (!window.electronAPI) {
            return;
        }

        try {
            await window.electronAPI.mcpAppClose(activeMcpApp ? { sessionId: activeMcpApp.sessionId } : {});
        } finally {
            setActiveMcpApp(null);
            setCenterMode('dashboard');
            setIsRightOpen(false);
        }
    }, [activeMcpApp]);

    const inlineMcpApps: InlineMcpAppEntry[] = useMemo(() => {
        if (!activeMcpApp || !isTldrawAppState(activeMcpApp)) {
            return EMPTY_INLINE_MCP_APPS;
        }
        const createdAtMs = Date.parse(activeMcpApp.updatedAt);
        return [{
            sessionId: activeMcpApp.sessionId,
            createdAtMs: Number.isNaN(createdAtMs) ? Date.now() : createdAtMs,
            appState: activeMcpApp,
            onClose: () => {
                void closeMcpApp();
            },
        }];
    }, [activeMcpApp, closeMcpApp]);

    const primePdfContextFromPath = useCallback((filePath: string) => {
        if (!window.electronAPI) return;
        void window.electronAPI.extractPdfText(filePath).then((r) => {
            if (r.text) setFullPdfText(r.text);
        });
    }, []);

    const openPdf = useCallback(async (filePath: string) => {
        if (!window.electronAPI) return;
        setShowSettings(false);
        const result = await window.electronAPI.openPdfInOnlyoffice(filePath);
        if (!result.success) {
            console.error(result.error || 'Failed to open PDF in ONLYOFFICE.');
            return;
        }
        primePdfContextFromPath(filePath);
    }, [primePdfContextFromPath]);

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
                        {editorFrameMessage && (
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

        if (activeCenterMode === 'mcpApp' && activeMcpApp) {
            return (
                <McpAppPane
                    appState={activeMcpApp}
                    display="fullscreen"
                    onClose={() => {
                        void closeMcpApp();
                    }}
                />
            );
        }

        return (
            <Dashboard
                ports={ports}
                openEditor={openEditor}
                primePdfContextFromPath={primePdfContextFromPath}
                subagents={excelorSnapshot?.subagents ?? []}
                subagentActivity={excelorSnapshot?.activity ?? []}
                promptHistory={excelorSnapshot?.subagentPrompts ?? []}
                skillProposals={excelorSnapshot?.skillProposals ?? []}
                planMode={excelorSnapshot?.planMode ?? null}
                planProposals={excelorSnapshot?.planProposals ?? []}
                excelorConversationId={excelorSnapshot?.conversationId}
                inlineMcpApps={inlineMcpApps}
            />
        );
    };

    return (
        <>
            <Titlebar
                toggleLeft={toggleLeft}
                toggleRight={toggleRight}
                isLeftOpen={isLeftOpen}
                isRightOpen={effectiveRightOpen}
                rightToggleDisabled={!rightPaneApplicable}
                onOpenSettings={() => setShowSettings(true)}
                onOpenBrowser={() => openBrowser()}
                onNewChat={servicesReady ? handleNewChat : undefined}
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
                <AssistantRuntimeProvider key={mainThreadKey} runtime={excelorRuntime}>
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
                                            onClick={() => {
                                                setCenterMode('dashboard');
                                                setIsRightOpen(false);
                                            }}
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
                            isOpen={effectiveRightOpen}
                            forceHidden={isBrowserToolThreadDocked}
                            showPdfContextPrompt={documentContext === 'pdf' && !!fullPdfText}
                            onIncludePdfContext={() => { includeFullPdfContextRef.current = true; }}
                            fullPdfTextRef={fullPdfTextRef}
                            includeFullPdfContextRef={includeFullPdfContextRef}
                            openPdf={openPdf}
                        />

                        {isBrowserToolThreadDocked && (
                            <aside
                                id="right-sidebar-docked-excelor"
                                className={`right-sidebar chat-sidebar ${!effectiveRightOpen ? 'hidden' : ''}`}
                                style={{ display: 'flex', flexDirection: 'column' }}
                            >
                                <div className="chat-history">
                                    <MyThread
                                        agentConfig={EXCELOR_AGENT_CONFIG}
                                        editorLoaded={activeCenterMode === 'editor' && !!editorUrl}
                                        openPdf={openPdf}
                                        subagents={excelorSnapshot?.subagents ?? []}
                                        activity={excelorSnapshot?.activity ?? []}
                                        promptHistory={excelorSnapshot?.subagentPrompts ?? []}
                                        skillProposals={excelorSnapshot?.skillProposals ?? []}
                                        planProposals={excelorSnapshot?.planProposals ?? []}
                                        planMode={excelorSnapshot?.planMode ?? null}
                                        excelorPlanScope={MAIN_SCOPE}
                                        excelorConversationId={excelorSnapshot?.conversationId}
                                    />
                                </div>
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
