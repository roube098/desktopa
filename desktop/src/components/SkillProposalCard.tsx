import { type FC, useCallback, useState } from "react";
import type { SkillProposalEntry } from "../types/skills";
import { submitSkillProposalApproval } from "../../lib/skill-proposal-approval.mjs";

interface SkillProposalCardProps {
    proposal: SkillProposalEntry;
    onDismiss: (id: string) => void;
}

export const SkillProposalCard: FC<SkillProposalCardProps> = ({ proposal, onDismiss }) => {
    const [expanded, setExpanded] = useState(false);
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(proposal.name);
    const [description, setDescription] = useState(proposal.description);
    const [body, setBody] = useState(proposal.body);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const handleAccept = useCallback(async () => {
        if (!name.trim() || !description.trim() || !body.trim()) {
            setError("Name, description, and body are required.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            await submitSkillProposalApproval({
                electronAPI: window.electronAPI,
                proposal,
                name,
                description,
                body,
                scope: "main",
            });
            onDismiss(proposal.id);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    }, [body, description, name, onDismiss, proposal, proposal.id]);

    const handleReject = useCallback(() => {
        onDismiss(proposal.id);
    }, [onDismiss, proposal.id]);

    return (
        <div className="skill-proposal-card" data-proposal-id={proposal.id}>
            <div className="skill-proposal-card-header">
                <div className="skill-proposal-card-title">
                    {proposal.action === "update" ? "Proposed skill update" : "Proposed new skill"}
                </div>
                <span className="skill-proposal-card-badge">{proposal.action}</span>
            </div>
            <p className="skill-proposal-card-desc">{proposal.description}</p>
            {proposal.action === "update" && proposal.skillNameToUpdate ? (
                <p className="skill-proposal-meta">Updates: <code>{proposal.skillNameToUpdate}</code></p>
            ) : null}
            <button
                type="button"
                className="skill-proposal-toggle"
                onClick={() => setExpanded((v) => !v)}
            >
                {expanded ? "Hide" : "Show"} full draft
            </button>
            {expanded && !editing ? (
                <pre className="skill-proposal-body-preview">{body}</pre>
            ) : null}
            {editing ? (
                <div className="skill-proposal-edit">
                    <label className="skill-proposal-label">
                        Name
                        <input
                            className="skill-proposal-input"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </label>
                    <label className="skill-proposal-label">
                        Description
                        <textarea
                            className="skill-proposal-textarea"
                            rows={2}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </label>
                    <label className="skill-proposal-label">
                        Body (markdown)
                        <textarea
                            className="skill-proposal-textarea skill-proposal-textarea-body"
                            rows={10}
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                        />
                    </label>
                </div>
            ) : null}
            {error ? <p className="skill-proposal-error">{error}</p> : null}
            <div className="skill-proposal-actions">
                <button
                    type="button"
                    className="skill-proposal-btn secondary"
                    onClick={() => setEditing((v) => !v)}
                    disabled={busy}
                >
                    {editing ? "Preview" : "Edit"}
                </button>
                <button
                    type="button"
                    className="skill-proposal-btn secondary"
                    onClick={handleReject}
                    disabled={busy}
                >
                    Reject
                </button>
                <button
                    type="button"
                    className="skill-proposal-btn primary"
                    onClick={handleAccept}
                    disabled={busy}
                >
                    {busy ? "Sending…" : "Accept & create skill"}
                </button>
            </div>
        </div>
    );
};
