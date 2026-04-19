import { type FC, useCallback, useState } from "react";
import type { PlanProposalEntry } from "../types/plan-mode";
import {
    submitPlanApproval,
    submitPlanRejection,
    submitPlanRevision,
} from "../../lib/plan-proposal-actions.mjs";

interface PlanProposalCardProps {
    proposal: PlanProposalEntry;
    onDismiss: (id: string) => void;
    onRequestRevision: (note: string) => void;
}

export const PlanProposalCard: FC<PlanProposalCardProps> = ({ proposal, onDismiss, onRequestRevision }) => {
    const [expanded, setExpanded] = useState(false);
    const [requestingRevision, setRequestingRevision] = useState(false);
    const [revisionNote, setRevisionNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const handleApprove = useCallback(async () => {
        setBusy(true);
        setError("");
        try {
            await submitPlanApproval({
                electronAPI: window.electronAPI,
                proposal,
                scope: "main",
            });
            onDismiss(proposal.id);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    }, [onDismiss, proposal]);

    const handleReject = useCallback(async () => {
        setBusy(true);
        setError("");
        try {
            await submitPlanRejection({
                electronAPI: window.electronAPI,
                proposal,
                scope: "main",
            });
            onDismiss(proposal.id);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    }, [onDismiss, proposal]);

    const handleRevision = useCallback(async () => {
        const trimmed = revisionNote.trim();
        if (!trimmed) {
            setError("A revision note is required.");
            return;
        }

        setBusy(true);
        setError("");
        try {
            await submitPlanRevision({
                electronAPI: window.electronAPI,
                proposal,
                note: trimmed,
                scope: "main",
            });
            onDismiss(proposal.id);
            onRequestRevision(trimmed);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    }, [onDismiss, onRequestRevision, proposal, revisionNote]);

    return (
        <div className="plan-proposal-card" data-proposal-id={proposal.id}>
            <div className="plan-proposal-card-header">
                <div>
                    <div className="plan-proposal-card-eyebrow">Plan mode</div>
                    <div className="plan-proposal-card-title">{proposal.title}</div>
                </div>
                <span className="plan-proposal-card-badge">r{proposal.revision}</span>
            </div>

            <p className="plan-proposal-card-summary">{proposal.summary}</p>

            <button
                type="button"
                className="plan-proposal-toggle"
                onClick={() => setExpanded((value) => !value)}
            >
                {expanded ? "Hide" : "Show"} full plan
            </button>

            {expanded ? (
                <pre className="plan-proposal-body-preview">{proposal.body}</pre>
            ) : null}

            {requestingRevision ? (
                <label className="plan-proposal-label">
                    Revision note
                    <textarea
                        className="plan-proposal-textarea"
                        rows={4}
                        value={revisionNote}
                        onChange={(event) => setRevisionNote(event.target.value)}
                        placeholder="Tell Excelor what to change in the plan."
                    />
                </label>
            ) : null}

            {error ? <p className="plan-proposal-error">{error}</p> : null}

            <div className="plan-proposal-actions">
                <button
                    type="button"
                    className="plan-proposal-btn secondary"
                    onClick={() => setRequestingRevision((value) => !value)}
                    disabled={busy}
                >
                    {requestingRevision ? "Cancel revision" : "Request revision"}
                </button>
                <button
                    type="button"
                    className="plan-proposal-btn secondary"
                    onClick={handleReject}
                    disabled={busy}
                >
                    Reject
                </button>
                {requestingRevision ? (
                    <button
                        type="button"
                        className="plan-proposal-btn secondary"
                        onClick={handleRevision}
                        disabled={busy}
                    >
                        {busy ? "Sending..." : "Send revision"}
                    </button>
                ) : null}
                <button
                    type="button"
                    className="plan-proposal-btn primary"
                    onClick={handleApprove}
                    disabled={busy}
                >
                    {busy ? "Approving..." : "Approve plan"}
                </button>
            </div>
        </div>
    );
};
