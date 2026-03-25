import React, { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';

type ActionState = {
  link: boolean;
  unlink: boolean;
  gateway: boolean;
  save: boolean;
};

const EMPTY_ACTION_STATE: ActionState = {
  link: false,
  unlink: false,
  gateway: false,
  save: false,
};

const DAY_OPTIONS = [
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' },
  { id: 0, label: 'Sun' },
];

const STATUS_LABELS: Record<GatewayRuntimeStatus, string> = {
  idle: 'Not linked',
  linking: 'Linking',
  waiting_for_qr: 'Waiting for QR',
  linked: 'Linked',
  starting: 'Starting gateway',
  running: 'Running',
  connected: 'Connected',
  stopping: 'Stopping',
  error: 'Error',
};

function normalizeAllowFrom(value: string): string[] {
  const values = value
    .split(/[\n,]/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return Array.from(new Set(values));
}

function stringifyAllowFrom(values: string[]): string {
  return values.join('\n');
}

function createDefaultSettings(): HeartbeatSettings {
  return {
    whatsapp: {
      accountId: 'default',
      enabled: true,
      linkedPhone: null,
      authDir: '',
      allowFrom: [],
    },
    heartbeat: {
      enabled: false,
      intervalMinutes: 30,
      activeHours: {
        start: '09:30',
        end: '16:00',
        timezone: 'America/New_York',
        daysOfWeek: [1, 2, 3, 4, 5],
      },
    },
    checklist: '',
  };
}

function validateSettingsDraft(draft: HeartbeatSettings): string | null {
  if (!draft.heartbeat.activeHours.start || !draft.heartbeat.activeHours.end) {
    return 'Start and end time are required.';
  }
  if (draft.heartbeat.activeHours.start >= draft.heartbeat.activeHours.end) {
    return 'Active hours start time must be before end time.';
  }
  if (draft.heartbeat.intervalMinutes < 5) {
    return 'Heartbeat interval must be at least 5 minutes.';
  }
  if (!draft.heartbeat.activeHours.daysOfWeek.length) {
    return 'Select at least one day of week.';
  }
  return null;
}

export function HeartbeatSettingsPanel() {
  const electronApi = (window as unknown as { electronAPI?: Record<string, unknown> }).electronAPI;
  const apiReady = Boolean(
    electronApi
    && typeof electronApi.getHeartbeatSettings === 'function'
    && typeof electronApi.updateHeartbeatSettings === 'function'
    && typeof electronApi.startWhatsAppLink === 'function'
    && typeof electronApi.cancelWhatsAppLink === 'function'
    && typeof electronApi.unlinkWhatsApp === 'function'
    && typeof electronApi.startHeartbeatGateway === 'function'
    && typeof electronApi.stopHeartbeatGateway === 'function'
    && typeof electronApi.onHeartbeatRuntimeState === 'function',
  );
  const [settings, setSettings] = useState<HeartbeatSettings>(createDefaultSettings());
  const [draft, setDraft] = useState<HeartbeatSettings>(createDefaultSettings());
  const [runtime, setRuntime] = useState<HeartbeatRuntimeState>({
    status: 'idle',
    connected: false,
    linking: false,
    qrText: null,
    linkedPhone: null,
    lastError: null,
  });
  const [allowFromText, setAllowFromText] = useState('');
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<ActionState>(EMPTY_ACTION_STATE);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!apiReady) {
        if (!cancelled) {
          setError('Heartbeat backend is unavailable. Fully quit Excelor (including tray) and relaunch.');
          setLoading(false);
        }
        return;
      }
      try {
        const loaded = await window.electronAPI.getHeartbeatSettings();
        if (cancelled) return;
        setSettings(loaded);
        setDraft(loaded);
        setAllowFromText(stringifyAllowFrom(loaded.whatsapp.allowFrom || []));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load heartbeat settings.');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    if (!apiReady) {
      return () => {
        cancelled = true;
      };
    }

    const unsubscribe = window.electronAPI.onHeartbeatRuntimeState((snapshot) => {
      if (cancelled) return;
      setRuntime(snapshot.state);
      setSettings(snapshot.settings);
      if (!actions.save) {
        setDraft(snapshot.settings);
        setAllowFromText(stringifyAllowFrom(snapshot.settings.whatsapp.allowFrom || []));
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [actions.save, apiReady]);

  useEffect(() => {
    let cancelled = false;
    const qrText = runtime.qrText;
    if (!qrText) {
      setQrImage(null);
      return () => {
        cancelled = true;
      };
    }

    void QRCode.toDataURL(qrText, { width: 220, margin: 1 }).then((url) => {
      if (!cancelled) {
        setQrImage(url);
      }
    }).catch(() => {
      if (!cancelled) {
        setQrImage(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [runtime.qrText]);

  const checklistWarning = useMemo(
    () => draft.heartbeat.enabled && !draft.checklist.trim(),
    [draft.heartbeat.enabled, draft.checklist],
  );

  const runAction = useCallback(async (key: keyof ActionState, action: () => Promise<void>) => {
    if (!apiReady) {
      setError('Heartbeat backend is unavailable. Fully quit Excelor (including tray) and relaunch.');
      return;
    }
    setActions((current) => ({ ...current, [key]: true }));
    setError(null);
    setSuccess(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setActions((current) => ({ ...current, [key]: false }));
    }
  }, [apiReady]);

  const handleLink = useCallback(async () => {
    setRuntime((current) => ({
      ...current,
      status: 'linking',
      linking: true,
      lastError: null,
    }));
    await runAction('link', async () => {
      await window.electronAPI.startWhatsAppLink();
      setSuccess('Waiting for QR scan. Use WhatsApp -> Linked Devices -> Link a Device.');
    });
  }, [runAction]);

  const handleCancelLink = useCallback(async () => {
    await runAction('link', async () => {
      await window.electronAPI.cancelWhatsAppLink();
      setSuccess('Linking cancelled.');
    });
  }, [runAction]);

  const handleUnlink = useCallback(async () => {
    await runAction('unlink', async () => {
      await window.electronAPI.unlinkWhatsApp();
      setSuccess('WhatsApp credentials removed.');
    });
  }, [runAction]);

  const handleToggleGateway = useCallback(async () => {
    const shouldStop = runtime.status === 'connected' || runtime.status === 'running' || runtime.status === 'starting';
    await runAction('gateway', async () => {
      if (shouldStop) {
        await window.electronAPI.stopHeartbeatGateway();
        setSuccess('Gateway stopped.');
      } else {
        await window.electronAPI.startHeartbeatGateway();
        setSuccess('Gateway started.');
      }
    });
  }, [runAction, runtime.status]);

  const handleDayToggle = useCallback((day: number) => {
    setDraft((current) => {
      const currentDays = current.heartbeat.activeHours.daysOfWeek || [];
      const nextDays = currentDays.includes(day)
        ? currentDays.filter((entry) => entry !== day)
        : [...currentDays, day];
      return {
        ...current,
        heartbeat: {
          ...current.heartbeat,
          activeHours: {
            ...current.heartbeat.activeHours,
            daysOfWeek: nextDays.sort((left, right) => left - right),
          },
        },
      };
    });
    setError(null);
    setSuccess(null);
  }, []);

  const handleSave = useCallback(async () => {
    const patch: HeartbeatSettings = {
      ...draft,
      whatsapp: {
        ...draft.whatsapp,
        allowFrom: normalizeAllowFrom(allowFromText),
      },
    };

    const validationError = validateSettingsDraft(patch);
    if (validationError) {
      setError(validationError);
      setSuccess(null);
      return;
    }

    await runAction('save', async () => {
      const updated = await window.electronAPI.updateHeartbeatSettings({
        whatsapp: {
          accountId: patch.whatsapp.accountId,
          enabled: patch.whatsapp.enabled,
          linkedPhone: patch.whatsapp.linkedPhone,
          authDir: patch.whatsapp.authDir,
          allowFrom: patch.whatsapp.allowFrom,
        },
        heartbeat: patch.heartbeat,
        checklist: patch.checklist,
      });
      setSettings(updated);
      setDraft(updated);
      setAllowFromText(stringifyAllowFrom(updated.whatsapp.allowFrom || []));
      setSuccess('Heartbeat settings saved.');
    });
  }, [allowFromText, draft, runAction]);

  if (loading) {
    return (
      <div className="settings-tab-content">
        <div className="settings-loading">
          <div className="settings-loading-spinner" />
        </div>
      </div>
    );
  }

  const statusLabel = STATUS_LABELS[runtime.status] || runtime.status;
  const gatewayRunning = runtime.status === 'connected' || runtime.status === 'running' || runtime.status === 'starting';

  return (
    <div className="settings-tab-content">
      <div className="settings-section heartbeat-section">
        <h3 className="settings-section-title">WhatsApp</h3>
        <div className="heartbeat-status-row">
          <span className={`heartbeat-status-pill status-${runtime.status}`}>{statusLabel}</span>
          {runtime.linkedPhone ? <span className="heartbeat-linked-phone">Linked: {runtime.linkedPhone}</span> : null}
        </div>
        {runtime.lastError ? <div className="provider-error">{runtime.lastError}</div> : null}
        {qrImage ? (
          <div className="heartbeat-qr-wrap">
            <img src={qrImage} alt="WhatsApp link QR code" className="heartbeat-qr-image" />
          </div>
        ) : null}
        {runtime.qrText && !qrImage ? (
          <div className="settings-warning">
            <div className="settings-warning-content">
              <p className="settings-warning-title">QR rendering failed</p>
              <p className="settings-warning-text">Retry link to regenerate the QR code.</p>
            </div>
          </div>
        ) : null}
        <div className="heartbeat-action-row">
          {runtime.linking ? (
            <button type="button" className="settings-done-btn" onClick={() => void handleCancelLink()} disabled={actions.link}>
              {actions.link ? 'Cancelling...' : 'Cancel Linking'}
            </button>
          ) : (
            <button type="button" className="settings-done-btn" onClick={() => void handleLink()} disabled={actions.link}>
              {actions.link ? 'Working...' : (runtime.linkedPhone ? 'Relink' : 'Link WhatsApp')}
            </button>
          )}
          <button type="button" className="settings-done-btn" onClick={() => void handleUnlink()} disabled={actions.unlink || runtime.linking}>
            {actions.unlink ? 'Working...' : 'Unlink'}
          </button>
          <button type="button" className="settings-done-btn" onClick={() => void handleToggleGateway()} disabled={actions.gateway || runtime.linking}>
            {actions.gateway ? 'Working...' : (gatewayRunning ? 'Stop Gateway' : 'Start Gateway')}
          </button>
        </div>
        <div className="settings-field">
          <label className="settings-label">Allowed Numbers (one per line)</label>
          <textarea
            className="settings-input heartbeat-textarea"
            value={allowFromText}
            onChange={(event) => setAllowFromText(event.target.value)}
            placeholder="+1234567890"
          />
        </div>
      </div>

      <div className="settings-section heartbeat-section">
        <h3 className="settings-section-title">Heartbeat Schedule</h3>
        <div className="settings-field">
          <label className="settings-label">
            <input
              type="checkbox"
              checked={draft.heartbeat.enabled}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  heartbeat: {
                    ...current.heartbeat,
                    enabled: event.target.checked,
                  },
                }))}
            />
            Enable Heartbeat
          </label>
        </div>
        <div className="heartbeat-grid">
          <div className="settings-field">
            <label className="settings-label">Interval (minutes)</label>
            <input
              type="number"
              min={5}
              className="settings-input"
              value={draft.heartbeat.intervalMinutes}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  heartbeat: {
                    ...current.heartbeat,
                    intervalMinutes: Number.parseInt(event.target.value || '0', 10) || 0,
                  },
                }))}
            />
          </div>
          <div className="settings-field">
            <label className="settings-label">Start</label>
            <input
              type="time"
              className="settings-input"
              value={draft.heartbeat.activeHours.start}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  heartbeat: {
                    ...current.heartbeat,
                    activeHours: {
                      ...current.heartbeat.activeHours,
                      start: event.target.value,
                    },
                  },
                }))}
            />
          </div>
          <div className="settings-field">
            <label className="settings-label">End</label>
            <input
              type="time"
              className="settings-input"
              value={draft.heartbeat.activeHours.end}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  heartbeat: {
                    ...current.heartbeat,
                    activeHours: {
                      ...current.heartbeat.activeHours,
                      end: event.target.value,
                    },
                  },
                }))}
            />
          </div>
          <div className="settings-field">
            <label className="settings-label">Timezone</label>
            <input
              type="text"
              className="settings-input"
              value={draft.heartbeat.activeHours.timezone}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  heartbeat: {
                    ...current.heartbeat,
                    activeHours: {
                      ...current.heartbeat.activeHours,
                      timezone: event.target.value,
                    },
                  },
                }))}
            />
          </div>
        </div>
        <div className="heartbeat-days-row">
          {DAY_OPTIONS.map((day) => (
            <button
              key={day.id}
              type="button"
              className={`settings-pill ${draft.heartbeat.activeHours.daysOfWeek.includes(day.id) ? 'active' : ''}`}
              onClick={() => handleDayToggle(day.id)}
            >
              {day.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-section heartbeat-section">
        <h3 className="settings-section-title">Heartbeat Checklist</h3>
        <textarea
          className="settings-input heartbeat-checklist"
          value={draft.checklist}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              checklist: event.target.value,
            }))}
          placeholder="- Item to monitor"
        />
        {checklistWarning ? (
          <div className="settings-warning">
            <div className="settings-warning-content">
              <p className="settings-warning-title">Checklist is empty</p>
              <p className="settings-warning-text">
                Heartbeat is enabled but checklist is empty, so heartbeat runs will be suppressed.
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {error ? <div className="provider-error">{error}</div> : null}
      {success && !error ? <div className="settings-success">{success}</div> : null}

      <div className="settings-actions">
        <button type="button" className="settings-done-btn" onClick={() => void handleSave()} disabled={actions.save}>
          {actions.save ? 'Saving...' : 'Save Heartbeat Settings'}
        </button>
      </div>
    </div>
  );
}
