import React, { useState, useEffect, useCallback } from 'react';
import { ProviderGrid } from './ProviderGrid';
import { ProviderSettingsPanel } from './ProviderSettingsPanel';
import { SkillsPanel } from './SkillsPanel';
import { ConnectorsPanel } from './ConnectorsPanel';
import { isProviderReady, hasAnyReadyProvider } from '../data/providers';
import './Settings.css';

interface Tab {
    id: string;
    label: string;
    icon: React.ReactNode;
}

const TABS: Tab[] = [
    {
        id: 'providers', label: 'Providers',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>,
    },
    {
        id: 'skills', label: 'Skills',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>,
    },
    {
        id: 'connectors', label: 'Connectors',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l1.92-1.91a5 5 0 0 0-7.07-7.08l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.54-.54l-1.92 1.91a5 5 0 0 0 7.07 7.08l1.1-1.1" /></svg>,
    },
    {
        id: 'about', label: 'About',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>,
    },
];

interface SettingsProps {
    onClose: () => void;
    ports: Ports;
}

export function Settings({ onClose, ports }: SettingsProps) {
    const [activeTab, setActiveTab] = useState('providers');
    const [settings, setSettings] = useState<ProviderSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
    const [gridExpanded, setGridExpanded] = useState(false);
    const [closeWarning, setCloseWarning] = useState(false);
    const [showModelError, setShowModelError] = useState(false);

    // Load settings on mount
    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            if (window.electronAPI?.getProviderSettings) {
                const data = await window.electronAPI.getProviderSettings();
                setSettings(data);

                // Auto-select active provider
                if (data.activeProviderId) {
                    setSelectedProvider(data.activeProviderId);
                }
            } else {
                // Fallback — no electron API available (running in browser only)
                setSettings({ activeProviderId: null, connectedProviders: {} });
            }

        } catch (err) {
            console.error("Failed to load provider settings", err);
            setSettings({ activeProviderId: null, connectedProviders: {} });
        } finally {
            setLoading(false);
        }
    };

    // Handle provider selection
    const handleSelectProvider = useCallback(async (providerId: string) => {
        setSelectedProvider(providerId);
        setCloseWarning(false);
        setShowModelError(false);

        // Auto-set as active if provider is ready
        const provider = settings?.connectedProviders?.[providerId];
        if (provider && isProviderReady(provider)) {
            if (window.electronAPI?.setActiveProvider) {
                await window.electronAPI.setActiveProvider(providerId);
                setSettings(prev => prev ? { ...prev, activeProviderId: providerId } : prev);
            }
        }
    }, [settings?.connectedProviders]);

    // Handle provider connect
    const handleConnect = useCallback(async (providerData: any) => {
        try {
            if (window.electronAPI?.connectProvider) {
                const updated = await window.electronAPI.connectProvider(providerData.providerId, providerData);
                setSettings(updated);

                // Auto-set as active if ready
                if (isProviderReady(updated.connectedProviders?.[providerData.providerId])) {
                    await window.electronAPI.setActiveProvider(providerData.providerId);
                    setSettings(prev => prev ? { ...prev, activeProviderId: providerData.providerId } : prev);
                }
            }
        } catch (err) {
            console.error("Connect failed", err);
        }
    }, []);

    // Handle provider disconnect
    const handleDisconnect = useCallback(async () => {
        if (!selectedProvider) return;
        try {
            if (window.electronAPI?.disconnectProvider) {
                const updated = await window.electronAPI.disconnectProvider(selectedProvider);
                setSettings(updated);
                setSelectedProvider(null);
            }
        } catch (err) {
            console.error("Disconnect failed", err);
        }
    }, [selectedProvider]);

    // Handle model change
    const handleModelChange = useCallback(async (modelId: string) => {
        if (!selectedProvider) return;
        try {
            if (window.electronAPI?.updateProviderModel) {
                const updated = await window.electronAPI.updateProviderModel(selectedProvider, modelId);
                setSettings(updated);

                // Auto-set as active
                const provider = updated.connectedProviders?.[selectedProvider];
                if (provider && isProviderReady(provider)) {
                    if (!updated.activeProviderId || updated.activeProviderId !== selectedProvider) {
                        await window.electronAPI.setActiveProvider(selectedProvider);
                        setSettings(prev => prev ? { ...prev, activeProviderId: selectedProvider } : prev);
                    }
                }
            }
            setShowModelError(false);
        } catch (err) {
            console.error("Model change failed", err);
        }
    }, [selectedProvider]);

    // Handle Done
    const handleDone = useCallback(() => {
        if (!settings) { onClose(); return; }

        // Check if selected provider needs a model
        if (selectedProvider) {
            const provider = settings.connectedProviders?.[selectedProvider];
            if (provider?.connectionStatus === 'connected' && !provider.selectedModelId) {
                setShowModelError(true);
                return;
            }
        }

        // Check if any provider is ready
        if (!hasAnyReadyProvider(settings)) {
            setActiveTab('providers');
            setCloseWarning(true);
            return;
        }

        onClose();
    }, [settings, selectedProvider, onClose]);

    // Handle force close
    const handleForceClose = useCallback(() => {
        setCloseWarning(false);
        onClose();
    }, [onClose]);

    if (loading) {
        return (
            <div className="settings-page">
                <div className="settings-loading">
                    <div className="settings-loading-spinner" />
                </div>
            </div>
        );
    }

    return (
        <div className="settings-page">
            {/* Left sidebar nav */}
            <nav className="settings-sidebar">
                <div className="settings-sidebar-logo">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                    </svg>
                    <span>Settings</span>
                </div>
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        className={`settings-nav-item ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </nav>

            {/* Right content area */}
            <div className="settings-main">
                {/* Header */}
                <div className="settings-page-header">
                    <h2>{TABS.find(t => t.id === activeTab)?.label}</h2>
                    <button className="close-btn" onClick={onClose} title="Close Settings">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="settings-page-content">
                    {/* Close warning */}
                    {closeWarning && (
                        <div className="settings-warning">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div className="settings-warning-content">
                                <p className="settings-warning-title">No provider ready</p>
                                <p className="settings-warning-text">
                                    You need to connect a provider and select a model before you can run tasks.
                                </p>
                                <button className="settings-warning-close" onClick={handleForceClose}>Close Anyway</button>
                            </div>
                        </div>
                    )}

                    {/* Providers Tab */}
                    {activeTab === 'providers' && settings && (
                        <div className="settings-tab-content">
                            <ProviderGrid
                                settings={settings}
                                selectedProvider={selectedProvider}
                                onSelectProvider={handleSelectProvider}
                                expanded={gridExpanded}
                                onToggleExpanded={() => setGridExpanded(!gridExpanded)}
                            />

                            {selectedProvider && (
                                <div className="settings-provider-panel-wrapper">
                                    <ProviderSettingsPanel
                                        key={selectedProvider}
                                        providerId={selectedProvider}
                                        connectedProvider={settings.connectedProviders?.[selectedProvider]}
                                        onConnect={handleConnect}
                                        onDisconnect={handleDisconnect}
                                        onModelChange={handleModelChange}
                                        showModelError={showModelError}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Skills Tab */}
                    {activeTab === 'skills' && (
                        <div className="settings-tab-content">
                            <SkillsPanel />
                        </div>
                    )}

                    {/* Connectors Tab */}
                    {activeTab === 'connectors' && (
                        <div className="settings-tab-content">
                            <ConnectorsPanel />
                        </div>
                    )}

                    {/* About Tab */}
                    {activeTab === 'about' && (
                        <div className="settings-tab-content">
                            <div className="settings-about">
                                <div className="settings-about-logo">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                                    </svg>
                                </div>
                                <h3>Excelor</h3>
                                <p className="settings-about-version">v1.0.0</p>
                                <p className="settings-about-desc">AI-powered document editor built on ONLYOFFICE</p>
                                <div className="settings-about-links">
                                    <span>Electron {window.electronAPI ? '✓' : '✗'}</span>
                                    <span>•</span>
                                    <span>React</span>
                                    <span>•</span>
                                    <span>Vite</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Footer with Done button */}
                    <div className="settings-footer">
                        <div />
                        <button className="settings-done-btn" onClick={handleDone}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Done
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
