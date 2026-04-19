import { type FC, useCallback, useState } from "react";

export interface SkillScriptApprovalRequest {
    requestId: string;
    skillName: string;
    skillPath: string;
    transports: string[];
}

interface SkillScriptApprovalCardProps {
    request: SkillScriptApprovalRequest;
    onResolve: (requestId: string, approved: boolean) => void;
}

export const SkillScriptApprovalCard: FC<SkillScriptApprovalCardProps> = ({ request, onResolve }) => {
    const [busy, setBusy] = useState(false);

    const handleAllow = useCallback(() => {
        if (busy) return;
        setBusy(true);
        onResolve(request.requestId, true);
    }, [busy, onResolve, request.requestId]);

    const handleDeny = useCallback(() => {
        if (busy) return;
        setBusy(true);
        onResolve(request.requestId, false);
    }, [busy, onResolve, request.requestId]);

    return (
        <div className="skill-script-approval-card" data-request-id={request.requestId}>
            <div className="skill-script-approval-card-header">
                <div className="skill-script-approval-card-title">
                    Skill wants to run scripts
                </div>
                <span className="skill-proposal-card-badge">{request.skillName}</span>
            </div>
            <p className="skill-script-approval-card-meta">
                <code>{request.skillPath}</code>
            </p>
            {request.transports.length > 0 ? (
                <div className="skill-script-approval-card-transports">
                    {request.transports.map((t) => (
                        <span key={t} className="skill-script-approval-card-transport">{t}</span>
                    ))}
                </div>
            ) : null}
            <p className="skill-proposal-card-desc">
                Allowing runs shell/script transports declared in this skill's SKILL.json for this session.
            </p>
            <div className="skill-proposal-actions">
                <button
                    type="button"
                    className="skill-proposal-btn secondary"
                    onClick={handleDeny}
                    disabled={busy}
                >
                    Deny
                </button>
                <button
                    type="button"
                    className="skill-proposal-btn primary"
                    onClick={handleAllow}
                    disabled={busy}
                >
                    {busy ? "Working…" : "Allow"}
                </button>
            </div>
        </div>
    );
};

export default SkillScriptApprovalCard;
