import { type FC, useCallback, useEffect, useState } from "react";

export interface SkillEnvSecretRequest {
    requestId: string;
    name: string;
    description?: string;
    skillName: string;
}

interface SkillEnvVarPromptDialogProps {
    request: SkillEnvSecretRequest;
    onSubmit: (value: string | null) => void;
}

export const SkillEnvVarPromptDialog: FC<SkillEnvVarPromptDialogProps> = ({ request, onSubmit }) => {
    const [value, setValue] = useState("");
    const [reveal, setReveal] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setValue("");
        setReveal(false);
        setBusy(false);
    }, [request.requestId]);

    const handleCancel = useCallback(() => {
        if (busy) return;
        setBusy(true);
        onSubmit(null);
    }, [busy, onSubmit]);

    const handleSubmit = useCallback(() => {
        if (busy) return;
        const trimmed = value;
        if (!trimmed) {
            onSubmit(null);
            return;
        }
        setBusy(true);
        onSubmit(trimmed);
    }, [busy, onSubmit, value]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                handleCancel();
            } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSubmit();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [handleCancel, handleSubmit]);

    return (
        <div
            className="skill-env-secret-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="skill-env-secret-title"
        >
            <div className="skill-env-secret-dialog skill-proposal-card">
                <div className="skill-proposal-card-header">
                    <div className="skill-proposal-card-title" id="skill-env-secret-title">
                        Enter secret for skill
                    </div>
                    <span className="skill-proposal-card-badge">{request.skillName}</span>
                </div>
                <p className="skill-proposal-card-desc">
                    Skill requires <code>{request.name}</code>. Used for this session only; never written to disk.
                </p>
                {request.description ? (
                    <p className="skill-proposal-meta">{request.description}</p>
                ) : null}
                <label className="skill-proposal-label">
                    Value
                    <div className="skill-env-secret-input-row">
                        <input
                            className="skill-proposal-input"
                            type={reveal ? "text" : "password"}
                            autoFocus
                            autoComplete="off"
                            spellCheck={false}
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder={request.name}
                            disabled={busy}
                        />
                        <button
                            type="button"
                            className="skill-proposal-btn secondary skill-env-secret-reveal"
                            onClick={() => setReveal((v) => !v)}
                            disabled={busy}
                            aria-pressed={reveal}
                        >
                            {reveal ? "Hide" : "Show"}
                        </button>
                    </div>
                </label>
                <p className="skill-env-secret-footnote">
                    Session-only. Press Cmd/Ctrl+Enter to submit, Esc to cancel.
                </p>
                <div className="skill-proposal-actions">
                    <button
                        type="button"
                        className="skill-proposal-btn secondary"
                        onClick={handleCancel}
                        disabled={busy}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="skill-proposal-btn primary"
                        onClick={handleSubmit}
                        disabled={busy || value.length === 0}
                    >
                        {busy ? "Submitting…" : "Submit"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SkillEnvVarPromptDialog;
