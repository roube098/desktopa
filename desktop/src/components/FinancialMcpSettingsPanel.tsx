import React, { useCallback, useMemo, useState } from 'react';

const statusConfig: Record<
    McpConnectorStatus,
    { label: string; dotClassName: string; textClassName: string }
> = {
    connected: {
        label: 'Connected',
        dotClassName: 'connector-status-dot connected',
        textClassName: 'connector-status-text connected',
    },
    disconnected: {
        label: 'Disconnected',
        dotClassName: 'connector-status-dot disconnected',
        textClassName: 'connector-status-text disconnected',
    },
    connecting: {
        label: 'Checking...',
        dotClassName: 'connector-status-dot connecting',
        textClassName: 'connector-status-text connecting',
    },
    error: {
        label: 'Error',
        dotClassName: 'connector-status-dot error',
        textClassName: 'connector-status-text error',
    },
};

interface FinancialMcpSettingsPanelProps {
    provider: FinancialMcpProviderMeta;
    state: FinancialMcpProviderState | null;
    onRefreshProviders: () => Promise<void>;
    credentialFieldLocation?: 'panel' | 'unified';
}

function truncateUrl(url: string | undefined): string {
    if (!url) return '';
    if (url.length <= 64) return url;
    return `${url.slice(0, 48)}...${url.slice(-12)}`;
}

export function FinancialMcpSettingsPanel({
    provider,
    state,
    onRefreshProviders,
    credentialFieldLocation = 'unified',
}: FinancialMcpSettingsPanelProps) {
    const [apiKey, setApiKey] = useState(state?.apiKey || '');
    const [connecting, setConnecting] = useState(false);
    const [checking, setChecking] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const status = statusConfig[state?.connectorStatus || 'disconnected'];
    const isConnected = Boolean(state?.enabled);
    const isApiKeyAuth = provider.authType === 'api-key';
    const isOauthAuth = provider.authType === 'oauth';
    const isUnifiedCredentialField = credentialFieldLocation === 'unified';
    const hideInlineApiKeyField = isUnifiedCredentialField && isApiKeyAuth;
    const showConnectButton = !(isUnifiedCredentialField && isApiKeyAuth);

    const connectButtonLabel = useMemo(() => {
        if (connecting) return 'Connecting...';
        if (isOauthAuth) return `Connect with ${provider.name}`;
        return 'Connect';
    }, [connecting, isOauthAuth, provider.name]);

    const handleConnect = useCallback(async () => {
        if (!window.electronAPI?.connectFinancialMcpProvider) return;
        if (isApiKeyAuth && !apiKey.trim()) {
            setError('Please enter an API key');
            return;
        }

        setConnecting(true);
        setError(null);
        setSuccess(null);
        try {
            await window.electronAPI.connectFinancialMcpProvider(
                provider.id,
                isApiKeyAuth ? apiKey.trim() : undefined,
            );
            await window.electronAPI.syncFinancialMcpProviders();
            await onRefreshProviders();
            setSuccess(`${provider.name} connected.`);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Connection failed');
        } finally {
            setConnecting(false);
        }
    }, [apiKey, isApiKeyAuth, onRefreshProviders, provider.id, provider.name]);

    const handleCheck = useCallback(async () => {
        if (!window.electronAPI?.checkFinancialMcpProvider) return;
        setChecking(true);
        setError(null);
        setSuccess(null);
        try {
            await window.electronAPI.checkFinancialMcpProvider(provider.id);
            await onRefreshProviders();
            setSuccess('Connection check passed.');
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Connection check failed');
            await onRefreshProviders();
        } finally {
            setChecking(false);
        }
    }, [onRefreshProviders, provider.id]);

    const handleDisconnect = useCallback(async () => {
        if (!window.electronAPI?.disconnectFinancialMcpProvider) return;
        setDisconnecting(true);
        setError(null);
        setSuccess(null);
        try {
            await window.electronAPI.disconnectFinancialMcpProvider(provider.id);
            await onRefreshProviders();
            setSuccess(`${provider.name} disconnected.`);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Disconnect failed');
        } finally {
            setDisconnecting(false);
        }
    }, [onRefreshProviders, provider.id, provider.name]);

    return (
        <div className="provider-settings-panel">
            <div className="provider-panel-header">
                <div className="provider-panel-logo">
                    <div className="financial-mcp-logo" style={{ borderColor: provider.color, color: provider.color }}>
                        {(provider.name || '?').slice(0, 1).toUpperCase()}
                    </div>
                </div>
                <div className="provider-panel-info">
                    <span className="provider-panel-name">{provider.name}</span>
                    <span className="provider-panel-label">{provider.label}</span>
                </div>
            </div>

            {!isConnected ? (
                <div className="provider-connect-form">
                    {isApiKeyAuth && !hideInlineApiKeyField && (
                        <div className="provider-field">
                            <div className="provider-field-header">
                                <label>API Key</label>
                                {provider.helpUrl && (
                                    <a href={provider.helpUrl} target="_blank" rel="noopener noreferrer" className="provider-help-link">
                                        How can I find it?
                                    </a>
                                )}
                            </div>
                            <div className="provider-key-row">
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => {
                                        setApiKey(e.target.value);
                                        setError(null);
                                        setSuccess(null);
                                    }}
                                    placeholder="Enter API key"
                                    disabled={connecting}
                                    className="provider-key-input"
                                    onKeyDown={(e) => e.key === 'Enter' && void handleConnect()}
                                />
                            </div>
                        </div>
                    )}
                    {hideInlineApiKeyField && (
                        <p className="settings-section-description" style={{ margin: 0 }}>
                            API key entry moved to the unified credential field above.
                            {provider.helpUrl ? (
                                <>
                                    {' '}
                                    <a href={provider.helpUrl} target="_blank" rel="noopener noreferrer" className="provider-help-link">
                                        How can I find it?
                                    </a>
                                </>
                            ) : null}
                        </p>
                    )}

                    {provider.notes && (
                        <p className="settings-section-description" style={{ margin: 0 }}>
                            {provider.notes}
                        </p>
                    )}

                    {error && (
                        <div className="provider-error">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="15" y1="9" x2="9" y2="15" />
                                <line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                            <span>{error}</span>
                        </div>
                    )}

                    {success && !error && (
                        <div className="settings-success">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span>{success}</span>
                        </div>
                    )}

                    {showConnectButton ? (
                        <button
                            className="provider-connect-btn"
                            onClick={() => void handleConnect()}
                            disabled={connecting || (isApiKeyAuth && !apiKey.trim())}
                        >
                            {connecting ? <span className="provider-spinner" /> : null}
                            {connectButtonLabel}
                        </button>
                    ) : null}
                </div>
            ) : (
                <div className="provider-connected-form">
                    <div className="provider-field">
                        <label>MCP URL</label>
                        <input
                            type="text"
                            value={truncateUrl(state?.mcpUrl)}
                            disabled
                            className="provider-key-input disabled"
                        />
                    </div>

                    <div className={status.textClassName}>
                        <span className={status.dotClassName} />
                        {status.label}
                    </div>

                    {provider.notes && (
                        <p className="settings-section-description" style={{ margin: 0 }}>
                            {provider.notes}
                        </p>
                    )}

                    {error && (
                        <div className="provider-error">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="15" y1="9" x2="9" y2="15" />
                                <line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                            <span>{error}</span>
                        </div>
                    )}

                    {success && !error && (
                        <div className="settings-success">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span>{success}</span>
                        </div>
                    )}

                    <div className="financial-mcp-panel-actions">
                        <button
                            type="button"
                            className="settings-secondary-btn"
                            onClick={() => void handleCheck()}
                            disabled={checking}
                        >
                            {checking ? <span className="connector-inline-spinner" /> : null}
                            {checking ? 'Checking...' : 'Check Connection'}
                        </button>
                        <button
                            className="provider-disconnect-btn"
                            onClick={() => void handleDisconnect()}
                            disabled={disconnecting}
                        >
                            {disconnecting ? <span className="connector-inline-spinner" /> : null}
                            Disconnect
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
