import React, { useCallback, useEffect, useState } from 'react';

type FinancialProviderId = 'financialdatasets' | 'exa' | 'tavily';

interface FinancialSettings {
  dataProvider: FinancialProviderId;
  apiKeys: {
    financialdatasets?: string;
    exa?: string;
    tavily?: string;
  };
}

const PROVIDER_LABELS: Record<FinancialProviderId, string> = {
  financialdatasets: 'Financial Datasets',
  exa: 'Exa (Web Search)',
  tavily: 'Tavily (Web Search)',
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
  const [loading, setLoading] = useState(!initialSettings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (initialSettings) return;
    let cancelled = false;

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
          setSettings({
            ...DEFAULT_FINANCIAL_SETTINGS,
            ...data,
            apiKeys: {
              ...DEFAULT_FINANCIAL_SETTINGS.apiKeys,
              ...(data?.apiKeys || {}),
            },
          });
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load financial settings', err);
          setSettings(DEFAULT_FINANCIAL_SETTINGS);
          setError('Failed to load financial settings.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [initialSettings]);

  const handleProviderChange = useCallback(
    (provider: FinancialProviderId) => {
      setSettings({ ...settings, dataProvider: provider });
      setError(null);
      setSuccess(null);
    },
    [settings],
  );

  const handleKeyChange = useCallback(
    (field: FinancialProviderId, value: string) => {
      setSettings({
        ...settings,
        apiKeys: {
          ...settings.apiKeys,
          [field]: value,
        },
      });
      setError(null);
      setSuccess(null);
    },
    [settings],
  );

  const handleSave = useCallback(async () => {
    if (!window.electronAPI?.updateFinancialSettings) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
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
      setError('Failed to save financial settings.');
    } finally {
      setSaving(false);
    }
  }, [settings]);

  if (loading) {
    return (
      <div className="settings-tab-content">
        <div className="settings-loading">
          <div className="settings-loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="settings-tab-content">
      <div className="settings-section">
        <h3 className="settings-section-title">Financial Data Provider</h3>
        <p className="settings-section-description">
          Choose which API Excelor should use for financial data and provide the corresponding API keys.
          Keys are stored locally in your user profile.
        </p>

        <div className="settings-row">
          <div className="settings-field">
            <label className="settings-label">Active Provider</label>
            <div className="settings-pill-group">
              {(Object.keys(PROVIDER_LABELS) as FinancialProviderId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`settings-pill ${settings.dataProvider === id ? 'active' : ''}`}
                  onClick={() => handleProviderChange(id)}
                >
                  {PROVIDER_LABELS[id]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="settings-row settings-row-grid">
          <div className="settings-field">
            <label className="settings-label">
              Financial Datasets API Key
              <span className="settings-label-hint">FINANCIAL_DATASETS_API_KEY</span>
            </label>
            <input
              type="password"
              className="provider-key-input"
              placeholder="Enter Financial Datasets API key"
              value={settings.apiKeys.financialdatasets || ''}
              onChange={(e) => handleKeyChange('financialdatasets', e.target.value)}
            />
          </div>

          <div className="settings-field">
            <label className="settings-label">
              Exa API Key
              <span className="settings-label-hint">EXASEARCH_API_KEY</span>
            </label>
            <input
              type="password"
              className="provider-key-input"
              placeholder="Enter Exa API key"
              value={settings.apiKeys.exa || ''}
              onChange={(e) => handleKeyChange('exa', e.target.value)}
            />
          </div>

          <div className="settings-field">
            <label className="settings-label">
              Tavily API Key
              <span className="settings-label-hint">TAVILY_API_KEY</span>
            </label>
            <input
              type="password"
              className="provider-key-input"
              placeholder="Enter Tavily API key"
              value={settings.apiKeys.tavily || ''}
              onChange={(e) => handleKeyChange('tavily', e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div className="provider-error" style={{ marginTop: 12 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {success && !error && (
          <div className="settings-success" style={{ marginTop: 12 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{success}</span>
          </div>
        )}

        <div className="settings-actions" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="settings-done-btn"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <span className="provider-spinner" />
                Saving...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Save
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

