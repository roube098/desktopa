import React, { useCallback, useEffect, useState } from 'react';

function getSourceLabel(source: SoulSettings['source']): string {
  if (source === 'user') return 'User override';
  if (source === 'bundled') return 'Bundled default';
  return 'No bundled file';
}

function getSourcePath(settings: SoulSettings): string {
  if (settings.source === 'user') return settings.userPath;
  if (settings.source === 'bundled') return settings.bundledPath || 'Bundled SOUL.md unavailable';
  return 'Bundled SOUL.md unavailable';
}

export function SoulSettingsPanel() {
  const [settings, setSettings] = useState<SoulSettings | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!window.electronAPI?.getSoulSettings) {
        if (!cancelled) {
          setError('Soul settings are unavailable in this environment.');
          setLoading(false);
        }
        return;
      }

      try {
        const loaded = await window.electronAPI.getSoulSettings();
        if (cancelled) return;
        setSettings(loaded);
        setDraft(loaded.content);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load soul settings', err);
        setError('Failed to load soul settings.');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = useCallback(async () => {
    if (!window.electronAPI?.updateSoulSettings) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await window.electronAPI.updateSoulSettings(draft);
      setSettings(updated);
      setDraft(updated.content);
      setSuccess('Soul settings saved.');
    } catch (err) {
      console.error('Failed to save soul settings', err);
      setError('Failed to save soul settings.');
    } finally {
      setSaving(false);
    }
  }, [draft]);

  const handleReset = useCallback(async () => {
    if (!window.electronAPI?.resetSoulSettings) return;
    setResetting(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await window.electronAPI.resetSoulSettings();
      setSettings(updated);
      setDraft(updated.content);
      setSuccess('Soul settings reset to default.');
    } catch (err) {
      console.error('Failed to reset soul settings', err);
      setError('Failed to reset soul settings.');
    } finally {
      setResetting(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="settings-tab-content">
        <div className="settings-loading">
          <div className="settings-loading-spinner" />
        </div>
      </div>
    );
  }

  const source = settings?.source ?? 'empty';
  const sourceLabel = settings ? getSourceLabel(source) : 'No bundled file';
  const sourcePath = settings ? getSourcePath(settings) : 'Bundled SOUL.md unavailable';

  return (
    <div className="settings-tab-content">
      <div className="settings-section soul-section">
        <h3 className="settings-section-title">Agent Soul</h3>
        <p className="settings-section-description">
          Edit the markdown identity document that shapes Excelor&apos;s tone and behavior.
        </p>
        <div className="soul-meta-row">
          <span className={`soul-source-badge source-${source}`}>{sourceLabel}</span>
          <span className="soul-path-text">{sourcePath}</span>
        </div>
        <p className="soul-note">
          Applies to new turns. In-flight turns keep the prompt they started with.
        </p>
        <div className="settings-field">
          <label className="settings-label">SOUL.md</label>
          <textarea
            className="settings-input soul-editor"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
              setSuccess(null);
            }}
            placeholder="# SOUL.md"
            spellCheck={false}
          />
        </div>
      </div>

      {error ? <div className="provider-error">{error}</div> : null}
      {success && !error ? <div className="settings-success">{success}</div> : null}

      <div className="settings-actions soul-actions">
        <button
          type="button"
          className="settings-secondary-btn"
          onClick={() => void handleReset()}
          disabled={resetting || saving || !settings?.hasUserOverride}
        >
          {resetting ? 'Resetting...' : 'Reset to Default'}
        </button>
        <button
          type="button"
          className="settings-done-btn"
          onClick={() => void handleSave()}
          disabled={saving || resetting}
        >
          {saving ? 'Saving...' : 'Save Soul Settings'}
        </button>
      </div>
    </div>
  );
}
