import React, { useCallback, useEffect, useState } from 'react';
import { FinancialMcpSettingsPanel } from './FinancialMcpSettingsPanel';
import { AnimatePresence, motion } from 'framer-motion';

type FinancialProviderId = 'financialdatasets' | 'exa' | 'tavily';

interface FinancialSettings {
  dataProvider: FinancialProviderId;
  apiKeys: {
    financialdatasets?: string;
    exa?: string;
    tavily?: string;
  };
}

type ActiveCredentialTarget =
  | { scope: 'web'; id: FinancialProviderId }
  | { scope: 'mcp'; id: string };

const PROVIDER_LABELS: Record<FinancialProviderId, string> = {
  financialdatasets: 'Financial Datasets',
  exa: 'Exa (Web Search)',
  tavily: 'Tavily (Web Search)',
};

const WEB_PROVIDER_KEY_META: Record<
  FinancialProviderId,
  { label: string; hint: string; placeholder: string }
> = {
  financialdatasets: {
    label: 'Financial Datasets API Key',
    hint: 'FINANCIAL_DATASETS_API_KEY',
    placeholder: 'Enter Financial Datasets API key',
  },
  exa: {
    label: 'Exa API Key',
    hint: 'EXASEARCH_API_KEY',
    placeholder: 'Enter Exa API key',
  },
  tavily: {
    label: 'Tavily API Key',
    hint: 'TAVILY_API_KEY',
    placeholder: 'Enter Tavily API key',
  },
};

const DEFAULT_FINANCIAL_SETTINGS: FinancialSettings = {
  dataProvider: 'financialdatasets',
  apiKeys: {
    financialdatasets: '',
    exa: '',
    tavily: '',
  },
};

interface FinancialSettingsPanelProps {
  initialSettings?: FinancialSettings | null;
}

export function FinancialSettingsPanel({ initialSettings }: FinancialSettingsPanelProps) {
  const [settings, setSettings] = useState<FinancialSettings>(initialSettings ?? DEFAULT_FINANCIAL_SETTINGS);
  const [mcpCatalog, setMcpCatalog] = useState<FinancialMcpProviderMeta[]>([]);
  const [mcpStates, setMcpStates] = useState<Record<string, FinancialMcpProviderState>>({});
  const [activeCredentialTarget, setActiveCredentialTarget] = useState<ActiveCredentialTarget>({
    scope: 'web',
    id: (initialSettings ?? DEFAULT_FINANCIAL_SETTINGS).dataProvider,
  });
  const [loading, setLoading] = useState(!initialSettings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isResyncing, setIsResyncing] = useState(false);

  useEffect(() => {
    if (initialSettings) return;
    let cancelled = false;

    const loadFinancialMcpProviders = async () => {
      if (!window.electronAPI?.getFinancialMcpProviders) {
        if (!cancelled) {
          setMcpCatalog([]);
          setMcpStates({});
        }
        return;
      }
      try {
        const payload = await window.electronAPI.getFinancialMcpProviders();
        if (cancelled) return;
        const nextCatalog = Array.isArray(payload?.catalog) ? payload.catalog : [];
        const nextStates = payload?.states || {};
        setMcpCatalog(nextCatalog);
        setMcpStates(nextStates);
      } catch (_error) {
        if (!cancelled) {
          setMcpCatalog([]);
          setMcpStates({});
        }
      }
    };

    const load = async () => {
      if (!window.electronAPI?.getFinancialSettings) {
        if (!cancelled) {
          setSettings(DEFAULT_FINANCIAL_SETTINGS);
        }
        setLoading(false);
        return;
      }
      try {
        const data = await window.electronAPI.getFinancialSettings();
        if (!cancelled) {
          const nextProvider = (data?.dataProvider || DEFAULT_FINANCIAL_SETTINGS.dataProvider) as FinancialProviderId;
          setSettings({
            ...DEFAULT_FINANCIAL_SETTINGS,
            ...data,
            apiKeys: {
              ...DEFAULT_FINANCIAL_SETTINGS.apiKeys,
              ...(data?.apiKeys || {}),
            },
          });
          setActiveCredentialTarget({ scope: 'web', id: nextProvider });
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load financial settings', err);
          setSettings(DEFAULT_FINANCIAL_SETTINGS);
          setError('Failed to load financial settings.');
        }
      } finally {
        await loadFinancialMcpProviders();
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [initialSettings]);

  const refreshFinancialMcpProviders = useCallback(async () => {
    if (!window.electronAPI?.getFinancialMcpProviders || isResyncing) return;
    setIsResyncing(true);
    try {
      const payload = await window.electronAPI.getFinancialMcpProviders();
      const nextCatalog = Array.isArray(payload?.catalog) ? payload.catalog : [];
      const nextStates = payload?.states || {};
      setMcpCatalog(nextCatalog);
      setMcpStates(nextStates);
    } finally {
      setIsResyncing(false);
    }
  }, [isResyncing]);

  const handleProviderChange = useCallback(
    (provider: FinancialProviderId) => {
      setSettings((current) => ({ ...current, dataProvider: provider }));
      setActiveCredentialTarget({ scope: 'web', id: provider });
      setError(null);
      setSuccess(null);
    },
    [],
  );

  const handleKeyChange = useCallback(
    (field: FinancialProviderId, value: string) => {
      setSettings((current) => ({
        ...current,
        apiKeys: {
          ...current.apiKeys,
          [field]: value,
        },
      }));
      setError(null);
      setSuccess(null);
    },
    [],
  );

  const handleMcpCardSelect = useCallback(
    (providerId: string) => {
      setActiveCredentialTarget({ scope: 'mcp', id: providerId });
      setError(null);
      setSuccess(null);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (!window.electronAPI?.updateFinancialSettings) return;
      const updated = await window.electronAPI.updateFinancialSettings(settings);
      setSettings({
        ...DEFAULT_FINANCIAL_SETTINGS,
        ...updated,
        apiKeys: {
          ...DEFAULT_FINANCIAL_SETTINGS.apiKeys,
          ...(updated?.apiKeys || {}),
        },
      });
      setSuccess('Financial data settings saved.');
    } catch (err) {
      console.error('Failed to save financial settings', err);
      setError(err instanceof Error ? err.message : 'Failed to save financial settings.');
    } finally {
      setSaving(false);
    }
  }, [settings]);

  if (loading) {
    return (
      <div className="flex h-[480px] w-full items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading financial settings...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-transparent">
      {/* Left Sidebar (List) */}
      <div className="flex w-[260px] flex-col border-r border-border bg-transparent flex-shrink-0 relative">
        <div className="pt-2 pb-4 pr-4">
          <div className="flex items-center gap-1 absolute top-1 right-2 z-10">
            <button 
              onClick={refreshFinancialMcpProviders}
              disabled={isResyncing}
              className="p-1.5 hover:bg-[#303030] hover:text-[#e0e0e0] text-[#8b949e] transition-colors rounded-md disabled:opacity-50"
              title="Refresh providers"
            >
              <div className={isResyncing ? "animate-spin" : ""}>
                <svg className="w-[16px] h-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
            </button>
          </div>
          
          <div className="text-[12px] font-medium text-[#8b949e] mb-2 mt-8 flex items-center gap-1.5 cursor-default select-none">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            Web Providers
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-2 scrollbar-thin">
          <AnimatePresence mode="popLayout">
            {(Object.keys(PROVIDER_LABELS) as FinancialProviderId[]).map((id, index) => {
              const isSelected = activeCredentialTarget.scope === 'web' && activeCredentialTarget.id === id;
              const isConnected = !!settings.apiKeys[id];
              
              return (
                <motion.button
                  key={id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.15, delay: index * 0.02 }}
                  onClick={() => handleProviderChange(id)}
                  className={`w-full flex justify-between items-center px-2 py-[5px] mb-[1px] ml-1 rounded text-left transition-colors duration-0 ${
                    isSelected 
                      ? 'bg-[#2b2d31] text-[#e0e0e0]' 
                      : 'text-[#8b949e] hover:bg-[#202020] hover:text-[#e0e0e0]'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <svg className="w-[14px] h-[14px] shrink-0 opacity-70" style={{
                      color: id === 'financialdatasets' ? '#3b82f6' : id === 'exa' ? '#f97316' : '#10b981'
                    }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                    <span className="truncate text-[13px]">{PROVIDER_LABELS[id].replace(' (Web Search)', '')}</span>
                  </div>
                  {isConnected && (
                     <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 ml-2" title="Connected"></div>
                  )}
                </motion.button>
              );
            })}

            {mcpCatalog.length > 0 && (
              <div className="text-[12px] font-medium text-[#8b949e] mb-2 mt-8 flex items-center gap-1.5 cursor-default select-none">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                MCP Connectors
              </div>
            )}

            {mcpCatalog.map((provider, index) => {
              const isSelected = activeCredentialTarget.scope === 'mcp' && activeCredentialTarget.id === provider.id;
              const state = mcpStates[provider.id];
              const isConnected = Boolean(state?.enabled);
              
              return (
                <motion.button
                  key={provider.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.15, delay: (Object.keys(PROVIDER_LABELS).length + index) * 0.02 }}
                  onClick={() => handleMcpCardSelect(provider.id)}
                  className={`w-full flex justify-between items-center px-2 py-[5px] mb-[1px] ml-1 rounded text-left transition-colors duration-0 ${
                    isSelected 
                      ? 'bg-[#2b2d31] text-[#e0e0e0]' 
                      : 'text-[#8b949e] hover:bg-[#202020] hover:text-[#e0e0e0]'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <svg className="w-[14px] h-[14px] shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    </svg>
                    <span className="truncate text-[13px]">{provider.name}</span>
                  </div>
                  {isConnected && (
                     <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 ml-2" title="Connected"></div>
                  )}
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Right Content Area (Detail) */}
      <div className="flex-1 overflow-hidden h-full relative z-0">
        <div className="h-full w-full overflow-y-auto scrollbar-thin p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeCredentialTarget.scope}-${activeCredentialTarget.id}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              {activeCredentialTarget.scope === 'web' ? (
                <div className="provider-settings-panel">
                  <div className="provider-panel-header">
                    <div className="provider-panel-logo">
                      <div className="financial-mcp-logo" style={{ 
                        borderColor: activeCredentialTarget.id === 'financialdatasets' ? '#3b82f6' : activeCredentialTarget.id === 'exa' ? '#f97316' : '#10b981', 
                        color: activeCredentialTarget.id === 'financialdatasets' ? '#3b82f6' : activeCredentialTarget.id === 'exa' ? '#f97316' : '#10b981' 
                      }}>
                        {PROVIDER_LABELS[activeCredentialTarget.id as FinancialProviderId].charAt(0).toUpperCase()}
                      </div>
                    </div>
                    <div className="provider-panel-info">
                      <span className="provider-panel-name">{PROVIDER_LABELS[activeCredentialTarget.id as FinancialProviderId].replace(' (Web Search)', '')}</span>
                      <span className="provider-panel-label">Web Provider</span>
                    </div>
                  </div>

                  <div className="provider-connect-form">
                    <div className="provider-field">
                      <div className="provider-field-header">
                        <label>
                          {WEB_PROVIDER_KEY_META[activeCredentialTarget.id as FinancialProviderId].label}
                          <span className="settings-label-hint" style={{ marginLeft: 8 }}>
                            {WEB_PROVIDER_KEY_META[activeCredentialTarget.id as FinancialProviderId].hint}
                          </span>
                        </label>
                      </div>
                      <div className="provider-key-row">
                        <input
                          type="password"
                          className="provider-key-input"
                          placeholder={WEB_PROVIDER_KEY_META[activeCredentialTarget.id as FinancialProviderId].placeholder}
                          value={settings.apiKeys[activeCredentialTarget.id as FinancialProviderId] || ''}
                          onChange={(e) => {
                            handleKeyChange(activeCredentialTarget.id as FinancialProviderId, e.target.value);
                          }}
                          disabled={saving}
                          onKeyDown={(e) => e.key === 'Enter' && void handleSave()}
                        />
                      </div>
                    </div>

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

                    <button
                      className="provider-connect-btn"
                      onClick={() => void handleSave()}
                      disabled={saving || !settings.apiKeys[activeCredentialTarget.id as FinancialProviderId]?.trim()}
                      style={{ marginTop: 8 }}
                    >
                      {saving ? <span className="provider-spinner" /> : null}
                      {saving ? 'Saving...' : 'Save Configuration'}
                    </button>
                  </div>
                </div>
              ) : (
                (() => {
                  const selectedProvider = mcpCatalog.find((provider) => provider.id === activeCredentialTarget.id);
                  if (!selectedProvider) return null;
                  return (
                    <FinancialMcpSettingsPanel
                      key={selectedProvider.id}
                      provider={selectedProvider}
                      state={mcpStates[activeCredentialTarget.id] || null}
                      onRefreshProviders={refreshFinancialMcpProviders}
                      credentialFieldLocation="panel"
                    />
                  );
                })()
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
