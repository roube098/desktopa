import React from 'react';

export type ExcelorSubagentPromptDisplayStatus =
    ExcelorSubagentDescriptor['status'] | 'updated';

interface ExcelorSubagentPromptBlockProps {
    promptEntry: ExcelorSubagentPromptEntry;
    subagent?: ExcelorSubagentDescriptor;
    activity?: ExcelorActivityEntry[];
    status: ExcelorSubagentPromptDisplayStatus;
    summary: string;
    isExpanded: boolean;
    onToggle: () => void;
}

export function truncateLine(value: string, max = 180): string {
    const text = String(value || '').trim();
    if (!text) return '';
    if (text.length <= max) return text;
    return `${text.slice(0, max)}...`;
}

export function formatActivityTime(value: string): string {
    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) {
        return '';
    }
    return timestamp.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

export function getPromptBlockSummary(args: {
    status: ExcelorSubagentPromptDisplayStatus;
    activity?: ExcelorActivityEntry[];
    subagent?: ExcelorSubagentDescriptor;
}): string {
    const { status, activity = [], subagent } = args;
    const lastActivity = activity[activity.length - 1];
    const latestDetail = truncateLine(lastActivity?.detail || '');
    if (latestDetail) {
        return latestDetail;
    }

    if (status === 'failed') {
        return truncateLine(subagent?.lastError || 'Failed.');
    }
    if (status === 'completed') {
        return truncateLine(subagent?.lastOutput || 'Completed.');
    }
    if (status === 'waiting') {
        return truncateLine(subagent?.lastMessage || 'Waiting for next step.');
    }
    if (status === 'running') {
        return truncateLine(subagent?.lastMessage || 'Working on the assigned task.');
    }
    if (status === 'updated') {
        return 'Superseded by a newer instruction.';
    }
    if (status === 'closed') {
        return 'Closed.';
    }
    return 'Ready.';
}

export function ExcelorSubagentPromptBlock({
    promptEntry,
    subagent,
    activity = [],
    status,
    summary,
    isExpanded,
    onToggle,
}: ExcelorSubagentPromptBlockProps) {
    const displayName = subagent?.nickname || promptEntry.agentId;
    const roleLabel = subagent
        ? `${subagent.roleName} - depth ${subagent.depth}`
        : promptEntry.agentId;
    const promptText = promptEntry.prompt || 'No task prompt captured yet.';

    return (
        <article className={`excelor-thread-subagent-entry excelor-subagent-inline-card ${isExpanded ? 'expanded' : ''}`}>
            <button
                type="button"
                className="excelor-subagent-trigger"
                aria-expanded={isExpanded}
                onClick={onToggle}
            >
                <div className="excelor-subagent-inline-head">
                    <strong>{displayName}</strong>
                    <span className={`excelor-subagent-pill status-${status}`}>{status}</span>
                </div>
                <p className="excelor-subagent-role">{roleLabel}</p>
                <p className={`excelor-subagent-summary ${status === 'failed' ? 'error' : ''}`}>{summary}</p>
            </button>

            {isExpanded && (
                <div className="excelor-subagent-expanded">
                    <section className="excelor-subagent-section">
                        <h4>Task Prompt</h4>
                        <pre className="excelor-subagent-prompt">{promptText}</pre>
                    </section>

                    <section className="excelor-subagent-section">
                        <h4>Live Activity</h4>
                        {activity.length === 0 ? (
                            <p className="excelor-subagent-empty">No activity yet.</p>
                        ) : (
                            <ol className="excelor-subagent-activity-list">
                                {activity.map((entry) => (
                                    <li key={entry.id} className="excelor-subagent-activity-item">
                                        <div className="excelor-subagent-activity-head">
                                            <span>{entry.title}</span>
                                            <time>{formatActivityTime(entry.createdAt)}</time>
                                        </div>
                                        {entry.detail && (
                                            <p className="excelor-subagent-activity-detail">{entry.detail}</p>
                                        )}
                                    </li>
                                ))}
                            </ol>
                        )}
                    </section>
                </div>
            )}
        </article>
    );
}
