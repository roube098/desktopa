import React, { useState, useEffect, useCallback } from 'react';
import { providerRequiresStoredKey, PROVIDER_META, ProviderLogo } from '../data/providers';

interface ProviderConnectData {
    providerId: string;
    connectionStatus?: string;
    selectedModelId: string | null;
    credentials?: { type: string; keyPrefix?: string; oauthProvider?: string; serverUrl?: string };
    availableModels?: Array<{ id: string; name?: string }>;
    fullApiKey?: string;
    baseUrl?: string;
    lastConnectedAt?: string;
}

interface ProviderSettingsPanelProps {
    providerId: string;
    connectedProvider?: ConnectedProvider;
    onConnect: (data: ProviderConnectData) => void;
    onDisconnect: () => void;
    onModelChange: (modelId: string) => void;
    showModelError: boolean;
}

interface ModelOption {
    id: string;
    name?: string;
    custom?: boolean;
}

export function ProviderSettingsPanel({
    providerId,
    connectedProvider,
    onConnect,
    onDisconnect,
    onModelChange,
    showModelError,
}: ProviderSettingsPanelProps) {
    const meta = PROVIDER_META[providerId];
    const isConnected = connectedProvider?.connectionStatus === 'connected';
    const missingStoredKey = isConnected
        && providerRequiresStoredKey(providerId)
        && connectedProvider?.hasStoredKey === false;

    // State for different providers
    const [apiKey, setApiKey] = useState('');
    const [serverUrl, setServerUrl] = useState(providerId === 'lmstudio' ? 'http://localhost:1234' : 'http://localhost:11434');
    const [openAiBaseUrl, setOpenAiBaseUrl] = useState('');

    const [connecting, setConnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [models, setModels] = useState<ModelOption[]>((connectedProvider as any)?.availableModels || []);
    const [signingIn, setSigningIn] = useState(false);

    const [showAddModel, setShowAddModel] = useState(false);
    const [newModelId, setNewModelId] = useState('');
    const [newModelName, setNewModelName] = useState('');
    const [addModelError, setAddModelError] = useState<string | null>(null);

    // Initialize server URL from credentials if already connected
    useEffect(() => {
        if (isConnected && (providerId === 'ollama' || providerId === 'lmstudio')) {
            const url = (connectedProvider as any)?.credentials?.serverUrl;
            if (url) setServerUrl(url);
        }
    }, [isConnected, providerId, connectedProvider]);

    const refreshModels = useCallback(async () => {
        if (window.electronAPI?.getMergedModels) {
            const merged = await window.electronAPI.getMergedModels(providerId);
            if (merged?.length) setModels(merged);
            return;
        }
        if (window.electronAPI?.fetchProviderModels) {
            const result = await window.electronAPI.fetchProviderModels(providerId, '');
            if (result?.models?.length) setModels(result.models);
        }
    }, [providerId]);

    useEffect(() => {
        if (!isConnected) return;
        if ((connectedProvider as any)?.availableModels?.length) {
            setModels((connectedProvider as any).availableModels);
            refreshModels();
            return;
        }
        if (providerId !== 'ollama' && providerId !== 'lmstudio') {
            refreshModels();
        }
    }, [isConnected, providerId, connectedProvider, refreshModels]);

    const handleAddModel = useCallback(async () => {
        const id = newModelId.trim();
        if (!id) { setAddModelError('Model ID is required'); return; }
        if (models.some(m => m.id === id)) { setAddModelError('Model already exists'); return; }
        try {
            if (window.electronAPI?.addCustomModel) {
                await window.electronAPI.addCustomModel(providerId, id, newModelName.trim() || id);
            }
            await refreshModels();
            setNewModelId('');
            setNewModelName('');
            setShowAddModel(false);
            setAddModelError(null);
        } catch (err: unknown) {
            setAddModelError(err instanceof Error ? err.message : 'Failed to add model');
        }
    }, [newModelId, newModelName, providerId, models, refreshModels]);

    const handleRemoveModel = useCallback(async (modelId: string) => {
        try {
            if (window.electronAPI?.removeCustomModel) {
                await window.electronAPI.removeCustomModel(providerId, modelId);
            }
            await refreshModels();
            if (connectedProvider?.selectedModelId === modelId) {
                onModelChange('');
            }
        } catch (_) { }
    }, [providerId, connectedProvider?.selectedModelId, onModelChange, refreshModels]);

    const handleChatGptSignIn = async () => {
        setSigningIn(true);
        setError(null);
        try {
            if (window.electronAPI?.loginOpenAiWithChatGpt) {
                // If backend supports OAuth flow
                const result = await window.electronAPI.loginOpenAiWithChatGpt();
                if (result?.connected) {
                    onConnect({
                        providerId,
                        connectionStatus: 'connected',
                        selectedModelId: null,
                        credentials: { type: 'oauth', oauthProvider: 'chatgpt' },
                        lastConnectedAt: new Date().toISOString(),
                    });
                } else {
                    setError('OAuth login failed: Not connected.');
                }
            } else {
                setError('OAuth login is currently not implemented in the backend.');
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Sign-in failed');
        } finally {
            setSigningIn(false);
        }
    };

    const handleLocalConnect = useCallback(async () => {
        if (!serverUrl.trim()) {
            setError('Please enter a server URL');
            return;
        }
        setConnecting(true);
        setError(null);

        try {
            let result;
            if (providerId === 'ollama') {
                result = await window.electronAPI.testOllamaConnection(serverUrl.trim());
            } else if (providerId === 'lmstudio') {
                result = await window.electronAPI.testLMStudioConnection(serverUrl.trim());
            }

            if (!result || !result.success) {
                setError(result?.error || 'Connection failed');
                setConnecting(false);
                return;
            }

            const fetchedModels = result.models || [];
            let defaultModelId: string | null = null;
            if (fetchedModels.length > 0) {
                defaultModelId = fetchedModels[0].id;
            }

            onConnect({
                providerId,
                selectedModelId: defaultModelId,
                credentials: { type: providerId, serverUrl: serverUrl.trim() },
                availableModels: fetchedModels,
                baseUrl: serverUrl.trim(),
            });

            setModels(fetchedModels);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Connection failed');
        } finally {
            setConnecting(false);
        }
    }, [serverUrl, providerId, onConnect]);

    const handleConnect = useCallback(async () => {
        if (!apiKey.trim()) {
            setError('Please enter an API key');
            return;
        }
        setConnecting(true);
        setError(null);

        try {
            // Validate key
            const validation = await window.electronAPI.validateApiKey(providerId, apiKey.trim());
            if (!validation.valid) {
                setError(validation.error || 'Invalid API key');
                setConnecting(false);
                return;
            }

            // Store the full key in memory (main process)
            await window.electronAPI.storeApiKey(providerId, apiKey.trim());

            // Fetch models
            const modelsResult = await window.electronAPI.fetchProviderModels(providerId, apiKey.trim());
            const fetchedModels = modelsResult?.models || [];

            const trimmedKey = apiKey.trim();
            const keyPrefix = trimmedKey.length > 20
                ? trimmedKey.substring(0, 8) + '...' + trimmedKey.substring(trimmedKey.length - 4)
                : trimmedKey.substring(0, 6) + '...';

            // Find default model
            const staticModels = fetchedModels;
            let defaultModelId: string | null = null;
            if (window.electronAPI?.getProviderMeta) {
                const metaData = await window.electronAPI.getProviderMeta();
                const backendMeta = metaData?.meta?.[providerId];
                if ((backendMeta as any)?.defaultModelId) {
                    if (staticModels.some(m => m.id === (backendMeta as any).defaultModelId)) {
                        defaultModelId = (backendMeta as any).defaultModelId;
                    }
                }
            }
            if (!defaultModelId && staticModels.length > 0) {
                defaultModelId = staticModels[0].id;
            }

            onConnect({
                providerId,
                selectedModelId: defaultModelId,
                credentials: { type: 'api_key', keyPrefix },
                availableModels: staticModels,
                fullApiKey: apiKey.trim(),
                baseUrl: openAiBaseUrl.trim() || undefined,
            });

            setApiKey('');
            setModels(staticModels);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Connection failed');
        } finally {
            setConnecting(false);
        }
    }, [apiKey, openAiBaseUrl, providerId, onConnect]);

    // Render helpers for different provider types
    const renderLocalProviderConnectForm = () => (
        <>
            <div className="provider-field">
                <div className="provider-field-header">
                    <label>{providerId === 'ollama' ? 'Ollama Server URL' : 'LM Studio Server URL'}</label>
                    {meta.helpUrl && (
                        <a href={meta.helpUrl} target="_blank" rel="noopener noreferrer" className="provider-help-link">
                            How can I find it?
                        </a>
                    )}
                </div>
                <div className="provider-key-row">
                    <input
                        type="text"
                        value={serverUrl}
                        onChange={e => { setServerUrl(e.target.value); setError(null); }}
                        placeholder={providerId === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234'}
                        disabled={connecting}
                        className="provider-key-input"
                        onKeyDown={e => e.key === 'Enter' && handleLocalConnect()}
                    />
                </div>
                {providerId === 'lmstudio' && (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, marginBottom: 0 }}>
                        Start LM Studio and enable the local server in Developer settings
                    </p>
                )}
            </div>

            {error && (
                <div className="provider-error">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    <span>{error}</span>
                </div>
            )}

            <button
                className="provider-connect-btn"
                onClick={handleLocalConnect}
                disabled={connecting || !serverUrl.trim()}
            >
                {connecting ? (
                    <span className="provider-spinner" />
                ) : (
                    <img src="/assets/icons/connect.svg" alt="" style={{ width: 16, height: 16, filter: 'invert(var(--is-dark, 1))' }} />
                )}
                {connecting ? 'Connecting...' : 'Connect'}
            </button>
        </>
    );

    const renderApiKeyConnectForm = () => (
        <>
            {providerId === 'openai' && (
                <div className="provider-oauth-section">
                    <button
                        type="button"
                        className="provider-oauth-btn"
                        onClick={handleChatGptSignIn}
                        disabled={signingIn}
                    >
                        <img src="/assets/ai-logos/openai.svg" className="provider-oauth-icon provider-logo-invert" alt="" />
                        {signingIn ? 'Signing in...' : 'Login with OpenAI'}
                    </button>
                    <div className="provider-oauth-divider">
                        <span /> <label>or</label> <span />
                    </div>
                </div>
            )}

            {providerId === 'openai' && (
                <div className="provider-field" style={{ marginBottom: 16 }}>
                    <label>Base URL (optional)</label>
                    <input
                        type="text"
                        value={openAiBaseUrl}
                        onChange={e => setOpenAiBaseUrl(e.target.value)}
                        placeholder="https://api.openai.com/v1"
                        disabled={connecting}
                        className="provider-key-input"
                    />
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, marginBottom: 0 }}>
                        Leave blank for OpenAI. Set to use an OpenAI-compatible endpoint.
                    </p>
                </div>
            )}

            <div className="provider-field">
                <div className="provider-field-header">
                    <label>API Key</label>
                    {meta.helpUrl && (
                        <a href={meta.helpUrl} target="_blank" rel="noopener noreferrer" className="provider-help-link">
                            How can I find it?
                        </a>
                    )}
                </div>
                <div className="provider-key-row">
                    <input
                        type="password"
                        value={apiKey}
                        onChange={e => { setApiKey(e.target.value); setError(null); }}
                        placeholder="Enter API Key"
                        disabled={connecting}
                        className="provider-key-input"
                        onKeyDown={e => e.key === 'Enter' && handleConnect()}
                    />
                    {apiKey && (
                        <button className="provider-key-clear" onClick={() => setApiKey('')} disabled={connecting}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className="provider-error">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    <span>{error}</span>
                </div>
            )}

            <button
                className="provider-connect-btn"
                onClick={handleConnect}
                disabled={connecting || !apiKey.trim()}
            >
                {connecting ? (
                    <span className="provider-spinner" />
                ) : (
                    <img src="/assets/icons/connect.svg" alt="" style={{ width: 16, height: 16, filter: 'invert(var(--is-dark, 1))' }} />
                )}
                {connecting ? 'Connecting...' : 'Connect'}
            </button>
        </>
    );

    return (
        <div className="provider-settings-panel">
            {/* Header */}
            <div className="provider-panel-header">
                <div className="provider-panel-logo" style={{ color: meta.color }}>
                    <ProviderLogo providerId={providerId} size={24} />
                </div>
                <div className="provider-panel-info">
                    <span className="provider-panel-name">{meta.name}</span>
                    <span className="provider-panel-label">{meta.label}</span>
                </div>
            </div>

            {!isConnected ? (
                <div className="provider-connect-form">
                    {providerId === 'ollama' || providerId === 'lmstudio'
                        ? renderLocalProviderConnectForm()
                        : renderApiKeyConnectForm()}
                </div>
            ) : (
                <div className="provider-connected-form">
                    {/* Connected key/URL display */}
                    <div className="provider-field">
                        <label>{providerId === 'ollama' || providerId === 'lmstudio' ? 'Server URL' : 'API Key'}</label>
                        <input
                            type="text"
                            value={
                                missingStoredKey
                                    ? 'Missing saved key - reconnect required'
                                    :
                                (connectedProvider as any)?.credentials?.serverUrl ||
                                (connectedProvider as any)?.credentials?.keyPrefix ||
                                (providerId === 'ollama' || providerId === 'lmstudio' ? 'Connected' : 'Key saved')
                            }
                            disabled
                            className="provider-key-input disabled"
                        />
                    </div>

                    {missingStoredKey && (
                        <div className="provider-error">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                            <span>Saved API key is missing. Disconnect and reconnect this provider before running tasks.</span>
                        </div>
                    )}

                    {/* Disconnect */}
                    <button className="provider-disconnect-btn" onClick={onDisconnect}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        Disconnect
                    </button>

                    {/* Model selector */}
                    <div className="provider-field">
                        <div className="provider-field-header">
                            <label>Model</label>
                            <button
                                className="provider-add-model-toggle"
                                onClick={() => { setShowAddModel(!showAddModel); setAddModelError(null); }}
                                title="Add a custom model"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                                Add Model
                            </button>
                        </div>
                        <select
                            className={`provider-model-select ${showModelError && !connectedProvider?.selectedModelId ? 'error' : ''}`}
                            value={connectedProvider?.selectedModelId || ''}
                            onChange={e => onModelChange(e.target.value)}
                        >
                            <option value="">Select a model...</option>
                            {models.map(m => (
                                <option key={m.id} value={m.id}>{m.name || m.id}{m.custom ? ' ★' : ''}</option>
                            ))}
                        </select>
                        {showModelError && !connectedProvider?.selectedModelId && (
                            <span className="provider-model-error">Please select a model</span>
                        )}
                    </div>

                    {/* Add custom model form */}
                    {showAddModel && (
                        <div className="provider-add-model-form">
                            <div className="provider-add-model-row">
                                <input
                                    type="text"
                                    value={newModelId}
                                    onChange={e => { setNewModelId(e.target.value); setAddModelError(null); }}
                                    placeholder="Model ID (e.g. gpt-5.2-codex)"
                                    className="provider-key-input"
                                    onKeyDown={e => e.key === 'Enter' && handleAddModel()}
                                />
                            </div>
                            <div className="provider-add-model-row">
                                <input
                                    type="text"
                                    value={newModelName}
                                    onChange={e => setNewModelName(e.target.value)}
                                    placeholder="Display name (optional)"
                                    className="provider-key-input"
                                    onKeyDown={e => e.key === 'Enter' && handleAddModel()}
                                />
                            </div>
                            {addModelError && (
                                <div className="provider-error">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                                    </svg>
                                    <span>{addModelError}</span>
                                </div>
                            )}
                            <div className="provider-add-model-actions">
                                <button className="provider-add-model-btn" onClick={handleAddModel}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    Add
                                </button>
                                <button className="provider-add-model-cancel" onClick={() => { setShowAddModel(false); setAddModelError(null); }}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Custom models list */}
                    {models.some(m => m.custom) && (
                        <div className="provider-custom-models">
                            <label className="provider-custom-models-label">Custom Models</label>
                            {models.filter(m => m.custom).map(m => (
                                <div key={m.id} className="provider-custom-model-item">
                                    <div className="provider-custom-model-info">
                                        <span className="provider-custom-model-name">{m.name || m.id}</span>
                                        <span className="provider-custom-model-id">{m.id}</span>
                                    </div>
                                    <button
                                        className="provider-custom-model-remove"
                                        onClick={() => handleRemoveModel(m.id)}
                                        title="Remove custom model"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
