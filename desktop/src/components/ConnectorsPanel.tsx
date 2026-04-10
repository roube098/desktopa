import { useCallback, useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Input } from './ui/input';

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

function deriveNameFromUrl(serverUrl: string): string {
    try {
        const parsed = new URL(serverUrl);
        const hostname = parsed.hostname.split('.');
        const stem = hostname.length > 1 ? hostname[hostname.length - 2] : hostname[0];
        return stem.charAt(0).toUpperCase() + stem.slice(1);
    } catch {
        return 'MCP Server';
    }
}

function getHostname(serverUrl: string): string {
    try {
        return new URL(serverUrl).hostname;
    } catch {
        return serverUrl;
    }
}

interface ConnectorCardProps {
    connector: McpConnector;
    onCheck: (connectorId: string) => void;
    onDisconnect: (connectorId: string) => void;
    onToggleEnabled: (connectorId: string, enabled: boolean) => void;
    onDelete: (connectorId: string) => void;
}

function ConnectorCard({
    connector,
    onCheck,
    onDisconnect,
    onToggleEnabled,
    onDelete,
}: ConnectorCardProps) {
    const [confirmDelete, setConfirmDelete] = useState(false);

    useEffect(() => {
        if (!confirmDelete) return;
        const timer = window.setTimeout(() => setConfirmDelete(false), 3000);
        return () => window.clearTimeout(timer);
    }, [confirmDelete]);

    const status = statusConfig[connector.status];
    const hostname = getHostname(connector.url);
    const displayName = connector.title || connector.name;

    return (
        <div className="connector-card">
            <div className="connector-card-header">
                <div className="connector-card-info">
                    <div className="connector-card-title-row">
                        <h3 className="connector-card-title">{displayName}</h3>
                        <div className="connector-card-statuses">
                            {connector.isBuiltIn ? (
                                <span className="connector-card-badge">Built-in</span>
                            ) : null}
                            <span className={status.textClassName}>
                                <span className={status.dotClassName} />
                                {status.label}
                            </span>
                        </div>
                    </div>
                    <p className="connector-card-hostname" title={connector.url}>
                        {hostname}
                    </p>
                    {connector.description ? (
                        <p className="connector-card-description">{connector.description}</p>
                    ) : null}
                </div>

                <div className="connector-card-controls">
                    <button
                        type="button"
                        className={`connector-toggle ${connector.isEnabled ? 'enabled' : ''}`}
                        onClick={() => onToggleEnabled(connector.id, !connector.isEnabled)}
                        title={connector.isEnabled ? 'Disable connector' : 'Enable connector'}
                    >
                        <span className={`connector-toggle-thumb ${connector.isEnabled ? 'enabled' : ''}`} />
                    </button>
                    {connector.isBuiltIn ? null : (
                        <button
                            type="button"
                            className={`connector-delete-btn ${confirmDelete ? 'confirm' : ''}`}
                            onClick={() => {
                                if (confirmDelete) {
                                    onDelete(connector.id);
                                    setConfirmDelete(false);
                                } else {
                                    setConfirmDelete(true);
                                }
                            }}
                            title={confirmDelete ? 'Click again to delete' : 'Delete connector'}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            <div className="connector-card-footer">
                {connector.status === 'connected' ? (
                    <button
                        type="button"
                        className="connector-secondary-btn"
                        onClick={() => onDisconnect(connector.id)}
                    >
                        Disconnect
                    </button>
                ) : connector.status === 'connecting' ? (
                    <button type="button" className="connector-secondary-btn" disabled>
                        <span className="connector-inline-spinner" />
                        Checking...
                    </button>
                ) : (
                    <button
                        type="button"
                        className="connector-primary-btn"
                        onClick={() => onCheck(connector.id)}
                    >
                        Check Connection
                    </button>
                )}
            </div>
        </div>
    );
}

export function ConnectorsPanel() {
    const [connectors, setConnectors] = useState<McpConnector[]>([]);
    const [loading, setLoading] = useState(true);
    const [url, setUrl] = useState('');
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadConnectors = useCallback(async () => {
        if (!window.electronAPI?.getMcpConnectors) {
            setConnectors([]);
            setLoading(false);
            return;
        }

        try {
            const data = await window.electronAPI.getMcpConnectors();
            setConnectors(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load connectors');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadConnectors();
    }, [loadConnectors]);

    const handleAdd = useCallback(async () => {
        const trimmedUrl = url.trim();
        if (!trimmedUrl) return;

        try {
            const parsed = new URL(trimmedUrl);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                setError('URL must start with http:// or https://');
                return;
            }
        } catch {
            setError('Please enter a valid URL');
            return;
        }

        setAdding(true);
        setError(null);

        try {
            const connector = await window.electronAPI.addMcpConnector(
                deriveNameFromUrl(trimmedUrl),
                trimmedUrl,
            );
            setConnectors((current) => [connector, ...current]);
            setUrl('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add connector');
        } finally {
            setAdding(false);
        }
    }, [url]);

    const handleToggleEnabled = useCallback(async (connectorId: string, enabled: boolean) => {
        try {
            const updatedConnector = await window.electronAPI.setMcpConnectorEnabled(
                connectorId,
                enabled,
            );
            if (!updatedConnector) return;
            setConnectors((current) =>
                current.map((connector) =>
                    connector.id === connectorId ? updatedConnector : connector,
                ),
            );
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update connector');
        }
    }, []);

    const handleCheck = useCallback(async (connectorId: string) => {
        setError(null);
        setConnectors((current) =>
            current.map((connector) =>
                connector.id === connectorId
                    ? { ...connector, status: 'connecting', updatedAt: new Date().toISOString() }
                    : connector,
            ),
        );

        try {
            const updatedConnector = await window.electronAPI.checkMcpConnector(connectorId);
            setConnectors((current) =>
                current.map((connector) =>
                    connector.id === connectorId ? updatedConnector : connector,
                ),
            );
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to reach this MCP connector endpoint',
            );
            const refreshed = await window.electronAPI.getMcpConnectors();
            setConnectors(refreshed);
        }
    }, []);

    const handleDisconnect = useCallback(async (connectorId: string) => {
        try {
            const updatedConnector = await window.electronAPI.disconnectMcpConnector(connectorId);
            if (!updatedConnector) return;
            setConnectors((current) =>
                current.map((connector) =>
                    connector.id === connectorId ? updatedConnector : connector,
                ),
            );
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to disconnect connector');
        }
    }, []);

    const handleDelete = useCallback(async (connectorId: string) => {
        try {
            await window.electronAPI.deleteMcpConnector(connectorId);
            setConnectors((current) =>
                current.filter((connector) => connector.id !== connectorId),
            );
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete connector');
        }
    }, []);

    const handleKeyDown = useCallback(
        (event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter' && !adding) {
                void handleAdd();
            }
        },
        [adding, handleAdd],
    );

    const builtInConnectors = connectors.filter((connector) => connector.isBuiltIn);
    const customConnectors = connectors.filter((connector) => !connector.isBuiltIn);

    if (loading) {
        return (
            <div className="connectors-loading">
                <div className="settings-loading-spinner" />
                <span>Loading connectors...</span>
            </div>
        );
    }

    return (
        <div className="connectors-panel">
            <p className="connectors-description">
                Built-in connectors stay available automatically. Add custom MCP endpoints here
                when you want extra remote tools or resources in desktop workflows.
            </p>

            {error ? <div className="connectors-error">{error}</div> : null}

            {builtInConnectors.length > 0 ? (
                <section className="connectors-section">
                    <div className="connectors-section-header">
                        <h3>Built-In</h3>
                        <p>Enabled by default and kept in sync with desktop updates.</p>
                    </div>
                    <div className="connectors-grid">
                        {builtInConnectors.map((connector) => (
                            <ConnectorCard
                                key={connector.id}
                                connector={connector}
                                onCheck={handleCheck}
                                onDisconnect={handleDisconnect}
                                onToggleEnabled={handleToggleEnabled}
                                onDelete={handleDelete}
                            />
                        ))}
                    </div>
                </section>
            ) : null}

            <section className="connectors-section">
                <div className="connectors-section-header">
                    <h3>Custom</h3>
                    <p>Add remote MCP endpoints that are not bundled with Excelor.</p>
                </div>

                <div className="connectors-add-form">
                    <Input
                        type="url"
                        placeholder="https://mcp-server.example.com"
                        value={url}
                        onChange={(event) => {
                            setUrl(event.target.value);
                            if (error) setError(null);
                        }}
                        onKeyDown={handleKeyDown}
                        disabled={adding}
                    />
                    <button
                        type="button"
                        className="connector-add-btn"
                        onClick={() => void handleAdd()}
                        disabled={adding || !url.trim()}
                    >
                        {adding ? <span className="connector-inline-spinner" /> : null}
                        {adding ? 'Adding...' : 'Add'}
                    </button>
                </div>

                {customConnectors.length > 0 ? (
                    <div className="connectors-grid">
                        {customConnectors.map((connector) => (
                            <ConnectorCard
                                key={connector.id}
                                connector={connector}
                                onCheck={handleCheck}
                                onDisconnect={handleDisconnect}
                                onToggleEnabled={handleToggleEnabled}
                                onDelete={handleDelete}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="connectors-empty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M8 12h8M6 8h12M6 16h12" />
                            <rect x="3" y="4" width="18" height="16" rx="2" />
                        </svg>
                        <p>No custom MCP connectors added yet</p>
                    </div>
                )}
            </section>
        </div>
    );
}
