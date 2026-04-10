import { useCallback, useEffect, useRef, useState } from 'react';
import {
    AppBridge,
    PostMessageTransport,
    type McpUiDownloadFileResult,
    type McpUiHostCapabilities,
    type McpUiHostContext,
    type McpUiMessageResult,
    type McpUiOpenLinkResult,
    type McpUiRequestDisplayModeResult,
} from '@modelcontextprotocol/ext-apps/app-bridge';
import { getMcpAppDisplayHostFields } from '../lib/mcp-app-host-context';

type AppLoadStatus = 'loading' | 'ready' | 'error';
type McpAppPaneDisplay = 'fullscreen' | 'inline';

const BRIDGE_INIT_TIMEOUT_MS = 12_000;

interface McpAppPaneProps {
    appState: McpAppState;
    onClose: () => void;
    display?: McpAppPaneDisplay;
    /** Extra classes on the root pane (e.g. thread card sizing). */
    className?: string;
    /** Hide the floating corner close control (e.g. when the parent row provides a header close). */
    hideCloseButton?: boolean;
}

const HOST_INFO = {
    name: 'Excelor Desktop',
    version: '1.0.0',
};

const HOST_CAPABILITIES: McpUiHostCapabilities = {
    serverTools: {},
    serverResources: {},
    logging: {},
    message: {},
    openLinks: {},
    updateModelContext: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractResourceHtml(result: Record<string, unknown>): string {
    const contents = Array.isArray(result.contents) ? result.contents : [];
    for (const entry of contents) {
        if (!isRecord(entry)) {
            continue;
        }

        if (typeof entry.text === 'string' && entry.text.trim()) {
            return entry.text;
        }

        if (typeof entry.blob === 'string' && entry.blob.trim()) {
            try {
                return atob(entry.blob);
            } catch {
                return '';
            }
        }
    }

    return '';
}

function buildHostContext(appState: McpAppState, display: McpAppPaneDisplay): McpUiHostContext {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    const displayFields = getMcpAppDisplayHostFields(display);
    return {
        theme,
        ...displayFields,
        platform: 'desktop',
        locale: navigator.language,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        userAgent: 'Excelor Desktop',
        deviceCapabilities: {
            touch: navigator.maxTouchPoints > 0,
            hover: true,
        },
        toolInfo: {
            tool: {
                name: appState.toolName,
                title: appState.title,
                description: appState.connectorTitle || appState.connectorName,
                inputSchema: {
                    type: 'object',
                    additionalProperties: true,
                },
                _meta: {
                    ui: {
                        resourceUri: appState.resourceUri,
                    },
                },
            },
        },
    };
}

function buildToolResult(appState: McpAppState): Record<string, unknown> {
    return {
        content: Array.isArray(appState.toolResult.content) ? appState.toolResult.content : [],
        structuredContent: appState.toolResult.structuredContent,
        _meta: isRecord(appState.toolResult.meta) ? appState.toolResult.meta : undefined,
        isError: false,
    };
}

function downloadBlob(name: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function downloadMcpAppContents(contents: unknown[]) {
    for (const item of contents) {
        if (!isRecord(item)) {
            continue;
        }

        if (item.type === 'resource' && isRecord(item.resource)) {
            const resource = item.resource;
            const mimeType = typeof resource.mimeType === 'string' ? resource.mimeType : 'application/octet-stream';
            const name = typeof resource.uri === 'string' && resource.uri.split('/').pop()
                ? String(resource.uri.split('/').pop())
                : 'download';

            if (typeof resource.blob === 'string') {
                const binary = atob(resource.blob);
                const bytes = new Uint8Array(binary.length);
                for (let index = 0; index < binary.length; index += 1) {
                    bytes[index] = binary.charCodeAt(index);
                }
                downloadBlob(name, new Blob([bytes], { type: mimeType }));
                continue;
            }

            if (typeof resource.text === 'string') {
                downloadBlob(name, new Blob([resource.text], { type: mimeType }));
            }
            continue;
        }

        if (item.type === 'resource_link' && typeof item.uri === 'string') {
            window.open(item.uri, '_blank', 'noopener,noreferrer');
        }
    }
}

async function teardownBridgeConnection(
    bridge: AppBridge | null,
    transport: PostMessageTransport | null,
) {
    if (bridge) {
        try {
            await bridge.teardownResource({});
        } catch {
            // Ignore teardown failures during unmount or refresh.
        }
    }

    if (transport) {
        try {
            await transport.close();
        } catch {
            // Ignore close failures during teardown.
        }
    }
}

export function McpAppPane({
    appState,
    onClose,
    display = 'fullscreen',
    className,
    hideCloseButton = false,
}: McpAppPaneProps) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const bridgeRef = useRef<AppBridge | null>(null);
    const transportRef = useRef<PostMessageTransport | null>(null);
    const blobUrlRef = useRef<string | null>(null);
    const lastInputInvocationRef = useRef<string>('');
    const lastResultInvocationRef = useRef<string>('');
    const appStateRef = useRef(appState);
    const displayRef = useRef(display);
    const bridgeInitTimeoutRef = useRef<number | null>(null);
    const bridgeBootGenerationRef = useRef(0);

    const [frameSrc, setFrameSrc] = useState('');
    const [status, setStatus] = useState<AppLoadStatus>('loading');
    const [message, setMessage] = useState(`Loading ${appState.title}...`);
    const [bridgePhase, setBridgePhase] = useState<'idle' | 'booting' | 'failed'>('idle');

    appStateRef.current = appState;
    displayRef.current = display;

    const clearBridgeTimeout = useCallback(() => {
        if (bridgeInitTimeoutRef.current !== null) {
            window.clearTimeout(bridgeInitTimeoutRef.current);
            bridgeInitTimeoutRef.current = null;
        }
    }, []);

    useEffect(() => {
        let disposed = false;
        setStatus('loading');
        setBridgePhase('idle');
        setMessage(`Loading ${appState.title}...`);

        // #region agent log
        fetch('http://127.0.0.1:7547/ingest/445f944e-452a-47ad-a4e0-f4df5fd886e1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'182468'},body:JSON.stringify({sessionId:'182468',location:'McpAppPane.tsx:resource-effect',message:'renderer calling mcpAppReadResource',data:{hypothesisId:'H1',rendererSessionId:String(appState.sessionId||'').trim(),rawLen:String(appState.sessionId||'').length,resourceUri:appState.resourceUri},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        void window.electronAPI.mcpAppReadResource(appState.sessionId, appState.resourceUri)
            .then((result) => {
                if (disposed) {
                    return;
                }

                const html = extractResourceHtml(result);
                if (!html) {
                    throw new Error('The MCP app resource did not return HTML content.');
                }

                if (blobUrlRef.current) {
                    URL.revokeObjectURL(blobUrlRef.current);
                }

                const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
                blobUrlRef.current = blobUrl;
                setFrameSrc(blobUrl);
            })
            .catch((error: unknown) => {
                if (disposed) {
                    return;
                }
                setStatus('error');
                setMessage(error instanceof Error ? error.message : String(error));
            });

        return () => {
            disposed = true;
        };
    }, [appState.sessionId, appState.resourceUri, appState.title]);

    useEffect(() => {
        return () => {
            clearBridgeTimeout();
            const currentBridge = bridgeRef.current;
            const currentTransport = transportRef.current;
            bridgeRef.current = null;
            transportRef.current = null;
            void teardownBridgeConnection(currentBridge, currentTransport);

            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
        };
    }, [clearBridgeTimeout]);

    useEffect(() => {
        const bridge = bridgeRef.current;
        if (!bridge || status !== 'ready') {
            return;
        }

        const invocationId = appState.invocationId || `${appState.sessionId}:${appState.updatedAt}`;
        bridge.setHostContext(buildHostContext(appState, display));
        if (appState.dispatchToolInput && lastInputInvocationRef.current !== invocationId) {
            lastInputInvocationRef.current = invocationId;
            void bridge.sendToolInput({
                arguments: isRecord(appState.toolArguments) ? appState.toolArguments : {},
            });
        }
        if (!appState.pending && lastResultInvocationRef.current !== invocationId) {
            lastResultInvocationRef.current = invocationId;
            void bridge.sendToolResult(buildToolResult(appState) as never);
        }
    }, [appState, status, display]);

    const runBridgeBoot = useCallback((retryIndex: 0 | 1) => {
        const iframeWindow = iframeRef.current?.contentWindow;
        if (!iframeWindow) {
            console.error('[McpAppPane] Bridge boot skipped: no iframe contentWindow', { sessionId: appStateRef.current.sessionId });
            setStatus('error');
            setBridgePhase('failed');
            setMessage('Canvas frame is not ready.');
            return;
        }

        clearBridgeTimeout();

        const previousBridge = bridgeRef.current;
        const previousTransport = transportRef.current;
        bridgeRef.current = null;
        transportRef.current = null;
        void teardownBridgeConnection(previousBridge, previousTransport);

        setBridgePhase('booting');
        setMessage(retryIndex === 0 ? 'Connecting canvas bridge...' : 'Retrying canvas bridge...');

        const currentApp = appStateRef.current;
        const currentDisplay = displayRef.current;

        const transport = new PostMessageTransport(iframeWindow, iframeWindow);
        const bridge = new AppBridge(null, HOST_INFO, HOST_CAPABILITIES, {
            hostContext: buildHostContext(currentApp, currentDisplay),
        });

        bridge.oncalltool = async (params) => {
            return await window.electronAPI.mcpAppCallTool(
                appStateRef.current.sessionId,
                String(params.name || ''),
                isRecord(params.arguments) ? params.arguments : {},
            ) as never;
        };
        bridge.onlistresources = async (params) => {
            return await window.electronAPI.mcpAppListResources(appStateRef.current.sessionId, params?.cursor) as never;
        };
        bridge.onlistresourcetemplates = async (params) => {
            return await window.electronAPI.mcpAppListResourceTemplates(appStateRef.current.sessionId, params?.cursor) as never;
        };
        bridge.onreadresource = async (params) => {
            return await window.electronAPI.mcpAppReadResource(appStateRef.current.sessionId, String(params.uri || '')) as never;
        };
        bridge.onmessage = async (params): Promise<McpUiMessageResult> => {
            return await window.electronAPI.mcpAppHandleMessage({
                scope: appStateRef.current.scope,
                sessionId: appStateRef.current.sessionId,
                content: Array.isArray(params.content) ? params.content as McpAppContentBlock[] : [],
            });
        };
        bridge.onopenlink = async ({ url }): Promise<McpUiOpenLinkResult> => {
            await window.electronAPI.browserOpenExternal(String(url || ''));
            return {};
        };
        bridge.ondownloadfile = async ({ contents }): Promise<McpUiDownloadFileResult> => {
            await downloadMcpAppContents(Array.isArray(contents) ? contents : []);
            return {};
        };
        bridge.onrequestdisplaymode = async (): Promise<McpUiRequestDisplayModeResult> => ({
            mode: displayRef.current === 'inline' ? 'inline' : 'fullscreen',
        });
        bridge.onupdatemodelcontext = async (params) => {
            await window.electronAPI.mcpAppUpdateModelContext({
                sessionId: appStateRef.current.sessionId,
                content: Array.isArray(params.content) ? params.content as McpAppContentBlock[] : [],
                structuredContent: isRecord(params.structuredContent)
                    ? params.structuredContent
                    : undefined,
            });
            return {};
        };
        bridge.oninitialized = () => {
            clearBridgeTimeout();
            // #region agent log
            fetch('http://127.0.0.1:7547/ingest/445f944e-452a-47ad-a4e0-f4df5fd886e1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'182468'},body:JSON.stringify({sessionId:'182468',location:'McpAppPane.tsx:oninitialized',message:'MCP app view initialized',data:{hypothesisId:'BRIDGE',sessionId:appStateRef.current.sessionId},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            setStatus('ready');
            setBridgePhase('idle');
            setMessage('');
            bridge.setHostContext(buildHostContext(appStateRef.current, displayRef.current));
            void window.electronAPI.mcpAppMarkReady({ sessionId: appStateRef.current.sessionId });
        };

        bridgeRef.current = bridge;
        transportRef.current = transport;

        void (async () => {
            try {
                await new Promise<void>((resolve) => {
                    queueMicrotask(() => resolve());
                });
                const connectStarted = Date.now();
                await bridge.connect(transport);
                const connectMs = Date.now() - connectStarted;
                // #region agent log
                fetch('http://127.0.0.1:7547/ingest/445f944e-452a-47ad-a4e0-f4df5fd886e1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'182468'},body:JSON.stringify({sessionId:'182468',location:'McpAppPane.tsx:bridge-connect',message:'AppBridge.connect resolved',data:{hypothesisId:'BRIDGE',connectMs,retryIndex,sessionId:appStateRef.current.sessionId},timestamp:Date.now()})}).catch(()=>{});
                // #endregion

                bridgeInitTimeoutRef.current = window.setTimeout(() => {
                    console.error('[McpAppPane] Bridge initialization timed out', {
                        sessionId: appStateRef.current.sessionId,
                        retryIndex,
                    });
                    clearBridgeTimeout();
                    const timedBridge = bridgeRef.current;
                    const timedTransport = transportRef.current;
                    bridgeRef.current = null;
                    transportRef.current = null;
                    void teardownBridgeConnection(timedBridge, timedTransport).finally(() => {
                        if (retryIndex === 0) {
                            window.requestAnimationFrame(() => {
                                runBridgeBoot(1);
                            });
                        } else {
                            setStatus('error');
                            setBridgePhase('failed');
                            setMessage('Canvas bridge did not initialize in time.');
                        }
                    });
                }, BRIDGE_INIT_TIMEOUT_MS);
            } catch (error: unknown) {
                clearBridgeTimeout();
                console.error('[McpAppPane] bridge.connect failed', error);
                bridgeRef.current = null;
                transportRef.current = null;
                void teardownBridgeConnection(bridge, transport);
                setStatus('error');
                setBridgePhase('failed');
                setMessage(error instanceof Error ? error.message : String(error));
            }
        })();
        // Intentionally omit runBridgeBoot from deps: recursive timeout retry uses the closure from this render.
    }, [clearBridgeTimeout]);

    const handleFrameLoad = useCallback(() => {
        if (!frameSrc || status === 'error' || status === 'ready') {
            return;
        }

        const gen = ++bridgeBootGenerationRef.current;
        window.requestAnimationFrame(() => {
            if (gen !== bridgeBootGenerationRef.current) {
                return;
            }
            runBridgeBoot(0);
        });
    }, [frameSrc, status, runBridgeBoot]);

    const handleRetryBridge = useCallback(() => {
        clearBridgeTimeout();
        setStatus('loading');
        setBridgePhase('idle');
        setMessage('Connecting canvas bridge...');
        const gen = ++bridgeBootGenerationRef.current;
        window.requestAnimationFrame(() => {
            if (gen !== bridgeBootGenerationRef.current) {
                return;
            }
            runBridgeBoot(0);
        });
    }, [runBridgeBoot, clearBridgeTimeout]);

    const rootClass = ['mcp-app-pane', `mcp-app-pane-${display}`, className].filter(Boolean).join(' ');

    const showOverlay = status !== 'ready' || Boolean(message);
    const showRetry = status === 'error' && bridgePhase === 'failed';

    return (
        <div className={rootClass}>
            {!hideCloseButton && (
                <button
                    className="editor-close-btn"
                    type="button"
                    title={`Close ${appState.title}`}
                    onClick={onClose}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            )}

            {showOverlay && (
                <div className={`mcp-app-overlay ${status === 'error' ? 'error' : ''}`}>
                    <strong>{appState.title}</strong>
                    <p>{message || (bridgePhase === 'booting' ? 'Connecting canvas bridge...' : 'Connecting app bridge...')}</p>
                    {showRetry && (
                        <button type="button" className="mcp-app-bridge-retry" onClick={handleRetryBridge}>
                            Retry connection
                        </button>
                    )}
                </div>
            )}

            <iframe
                key={`${appState.sessionId}:${appState.resourceUri}`}
                ref={iframeRef}
                className="mcp-app-frame"
                src={frameSrc}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
                allow="clipboard-read; clipboard-write"
                onLoad={handleFrameLoad}
            />
        </div>
    );
}
