import {
    ThreadPrimitive,
    MessagePrimitive,
    ComposerPrimitive,
    SelectionToolbarPrimitive,
    SuggestionPrimitive,
    AttachmentPrimitive,
} from "@assistant-ui/react";
import { useAui, useAuiState } from "@assistant-ui/store";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { type FC, type RefObject, useRef, useCallback, createContext, useContext, useEffect, useMemo, useState, useId } from "react";
import { Citation } from "./tool-ui/citation";
import { safeParseSerializableCitation } from "./tool-ui/citation/schema";
import { makeAssistantToolUI } from "@assistant-ui/react";
import type { AgentConfig } from "../types/agent-types";
import { ComposerModelSelector } from "./ComposerModelSelector";
import { QuestionFlow } from "./tool-ui/question-flow";
import { safeParseSerializableQuestionFlow } from "./tool-ui/question-flow/schema";
import { ExcelorSubagentPromptBlock, getPromptBlockSummary, type ExcelorSubagentPromptDisplayStatus } from "./ExcelorSubagentCards";
import { ComposerWorkspaceMentions } from "./ComposerWorkspaceMentions";
import { SkillProposalCard } from "./SkillProposalCard";
import { SkillEnvVarPromptDialog, type SkillEnvSecretRequest } from "./SkillEnvVarPromptDialog";
import { SkillScriptApprovalCard, type SkillScriptApprovalRequest } from "./SkillScriptApprovalCard";
import type { SkillProposalEntry } from "../types/skills";
import { PlanProposalCard } from "./PlanProposalCard";
import type { PlanModeEntry, PlanProposalEntry } from "../types/plan-mode";
import { EXCELOR_USER_ABORT_REASON } from "../lib/excelor-streaming";
import { McpAppPane } from "./McpAppPane";
import type { InlineMcpAppEntry } from "../types/inline-mcp-app";
import { mergeInlineThreadItems } from "../lib/inline-thread-merge";

const OpenPdfContext = createContext<((path: string) => void) | null>(null);

export const CitationUI = makeAssistantToolUI({
    toolName: "showCitation",
    render: function CitationTool({ args }) {
        const parsed = safeParseSerializableCitation(args);
        if (!parsed) return null;
        return <Citation {...parsed} variant="default" />;
    }
});

export const QuestionFlowUI = makeAssistantToolUI({
    toolName: "configureProject",
    render: function QuestionFlowTool({ args, result, toolCallId, addResult }) {
        const parsed = safeParseSerializableQuestionFlow({
            ...args,
            id: (args as any)?.id ?? `wizard-${toolCallId}`,
        });
        if (!parsed) return null;
        if (result) {
            return (
                <QuestionFlow
                    id={parsed.id}
                    choice={{
                        title: "Project configured",
                        summary: Object.entries(result as Record<string, string[]>).map(
                            ([key, values]) => ({
                                label: key,
                                value: values.join(", "),
                            }),
                        ),
                    }}
                />
            );
        }
        if (parsed.choice) {
            return <QuestionFlow id={parsed.id} choice={parsed.choice} />;
        }
        if (parsed.steps) {
            return (
                <QuestionFlow
                    id={parsed.id}
                    steps={parsed.steps}
                    onComplete={(answers) => addResult?.(answers)}
                />
            );
        }
        if (parsed.options && parsed.title && parsed.step) {
            return (
                <QuestionFlow
                    id={parsed.id}
                    step={parsed.step}
                    title={parsed.title}
                    description={parsed.description}
                    options={parsed.options}
                    selectionMode={parsed.selectionMode}
                />
            );
        }
        return null;
    }
});

const PdfMentionTrigger: FC = () => {
    const aui = useAui();
    const openPdf = useContext(OpenPdfContext);
    const composerText = useAuiState((s) => (s.composer.isEditing ? s.composer.text : ""));
    const fileInputRef = useRef<HTMLInputElement>(null);
    const showTrigger = /\@pdf\b/i.test(composerText);

    const handleAttachPdf = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
                await aui.composer().addAttachment(file);
                const current = aui.composer().getState().text;
                const next = current.replace(/\s*@pdf\s*/gi, " ").trim();
                aui.composer().setText(next);
                const path = (file as File & { path?: string }).path;
                if (path && openPdf) openPdf(path);
            } catch (err) {
                console.error("Failed to add PDF attachment:", err);
            }
        },
        [aui, openPdf],
    );

    if (!showTrigger) return null;
    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="aui-composer-pdf-input-hidden"
                style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
                aria-hidden
                onChange={handleFileChange}
            />
            <button
                type="button"
                className="aui-composer-pdf-mention-trigger"
                onClick={handleAttachPdf}
                aria-label="Attach PDF for @pdf"
            >
                Attach PDF
            </button>
        </>
    );
};

const AttachmentUI: FC = () => {
    const openPdf = useContext(OpenPdfContext);
    const attachment = useAuiState((s) => s.attachment);
    const name = attachment?.name ?? "";
    const file = attachment && "file" in attachment ? (attachment as { file?: File & { path?: string } }).file : undefined;
    const isPdf = name.toLowerCase().endsWith(".pdf") || (attachment?.contentType ?? "").toLowerCase().includes("pdf");
    const pdfPath = file?.path;

    return (
        <AttachmentPrimitive.Root className="aui-attachment-root">
            <div className="aui-attachment-thumb">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>

                {isPdf && pdfPath && openPdf && (
                    <button
                        type="button"
                        className="aui-attachment-open-pdf"
                        onClick={() => openPdf(pdfPath)}
                        title="Open in ONLYOFFICE"
                    >
                        Open in ONLYOFFICE
                    </button>
                )}

                <AttachmentPrimitive.Remove asChild>
                    <button className="aui-attachment-remove" title="Remove attachment">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </AttachmentPrimitive.Remove>
            </div>
        </AttachmentPrimitive.Root>
    );
};

interface MyThreadProps {
    agentConfig?: AgentConfig;
    editorLoaded?: boolean;
    openPdf?: (path: string) => void;
    subagents?: ExcelorSubagentDescriptor[];
    activity?: ExcelorActivityEntry[];
    promptHistory?: ExcelorSubagentPromptEntry[];
    skillProposals?: SkillProposalEntry[];
    planProposals?: PlanProposalEntry[];
    /** Current Excelor plan mode (drives toolbar switch). */
    planMode?: PlanModeEntry | null;
    /** When set with planMode, Plan toggle calls enter/exit for this Excelor runtime scope (omit in non-Excelor chats). */
    excelorPlanScope?: ExcelorScope;
    /** When set, only subagent prompts/agents/activity for this Excelor conversation are shown. */
    excelorConversationId?: string;
    /** Active built-in MCP sessions rendered as synthetic thread rows (e.g. inline tldraw). */
    inlineMcpApps?: InlineMcpAppEntry[];
}

type InlineThreadRenderItem =
    | {
        kind: "message";
        id: string;
        createdAtMs: number;
        index: number;
        order: number;
    }
    | {
        kind: "subagent";
        id: string;
        createdAtMs: number;
        promptId: string;
        order: number;
    }
    | {
        kind: "skill_proposal";
        id: string;
        createdAtMs: number;
        proposalId: string;
        order: number;
    }
    | {
        kind: "plan_proposal";
        id: string;
        createdAtMs: number;
        proposalId: string;
        order: number;
    }
    | {
        kind: "mcp_app";
        id: string;
        createdAtMs: number;
        sessionId: string;
        order: number;
    };

type PromptBlockData = {
    promptEntry: ExcelorSubagentPromptEntry;
    subagent?: ExcelorSubagentDescriptor;
    activity: ExcelorActivityEntry[];
    status: ExcelorSubagentPromptDisplayStatus;
    summary: string;
    createdAtMs: number;
};

function toTimestamp(value: unknown): number {
    if (value instanceof Date) {
        return value.getTime();
    }
    const timestamp = Date.parse(String(value || ""));
    return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getTerminalPromptStatus(entry?: ExcelorActivityEntry): ExcelorSubagentPromptDisplayStatus | null {
    switch (entry?.subagentEventType) {
        case "subagent_completed":
            return "completed";
        case "subagent_failed":
            return "failed";
        case "subagent_closed":
            return "closed";
        default:
            return null;
    }
}

export const MyThread: FC<MyThreadProps> = ({
    agentConfig,
    openPdf,
    subagents = [],
    activity = [],
    promptHistory = [],
    skillProposals = [],
    planProposals = [],
    planMode = null,
    excelorPlanScope,
    excelorConversationId,
    inlineMcpApps = [],
}) => {
    const aui = useAui();
    const [expandedPromptId, setExpandedPromptId] = useState<string | null>(null);
    const [dismissedProposalIds, setDismissedProposalIds] = useState<Set<string>>(() => new Set());
    const [pendingEnvSecret, setPendingEnvSecret] = useState<SkillEnvSecretRequest | null>(null);
    const [pendingScriptApprovals, setPendingScriptApprovals] = useState<SkillScriptApprovalRequest[]>([]);
    const sendButtonRef = useRef<HTMLButtonElement | null>(null);
    const threadMessages = useAuiState((s: any) => Array.isArray(s.thread?.messages) ? s.thread.messages : []);
    const isThreadRunning = useAuiState((s: any) => Boolean(s.thread?.isRunning));
    const [planToggleBusy, setPlanToggleBusy] = useState(false);
    const [planModeToggleError, setPlanModeToggleError] = useState<string | null>(null);
    const planSwitchId = useId();
    const planActive = Boolean(planMode?.active);
    const hasPlanModeIpc = Boolean(
        typeof window !== "undefined"
        && typeof window.electronAPI?.excelorEnterPlanMode === "function"
        && typeof window.electronAPI?.excelorExitPlanMode === "function",
    );

    const handlePlanModeToggle = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const next = e.target.checked;
        const api = window.electronAPI;
        if (!excelorPlanScope) return;
        if (!hasPlanModeIpc) {
            setPlanModeToggleError("Plan mode is not available in this build.");
            return;
        }
        if (next === planActive) return;
        setPlanToggleBusy(true);
        setPlanModeToggleError(null);
        try {
            if (next) {
                await api.excelorEnterPlanMode!(excelorPlanScope);
            } else {
                if (isThreadRunning && api.excelorAbortTurn) {
                    try {
                        await api.excelorAbortTurn(excelorPlanScope, EXCELOR_USER_ABORT_REASON);
                    } catch {
                        // Best effort: runtime may already be idle.
                    }
                }
                await api.excelorExitPlanMode!(excelorPlanScope);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setPlanModeToggleError(message);
            console.error("Plan mode toggle failed:", err);
        } finally {
            setPlanToggleBusy(false);
        }
    }, [planActive, excelorPlanScope, isThreadRunning, hasPlanModeIpc]);

    const scopedPromptHistory = useMemo(() => {
        if (!excelorConversationId) return promptHistory;
        return promptHistory.filter(
            (p) => !p.conversationId || p.conversationId === excelorConversationId,
        );
    }, [promptHistory, excelorConversationId]);

    const scopedSubagents = useMemo(() => {
        if (!excelorConversationId) return subagents;
        return subagents.filter(
            (s) => !s.conversationId || s.conversationId === excelorConversationId,
        );
    }, [subagents, excelorConversationId]);

    const scopedActivity = useMemo(() => {
        if (!excelorConversationId) return activity;
        const visibleAgents = new Set<string>();
        for (const p of scopedPromptHistory) visibleAgents.add(p.agentId);
        for (const s of scopedSubagents) visibleAgents.add(s.id);
        return activity.filter(
            (a) => !a.sourceAgentId || visibleAgents.has(a.sourceAgentId),
        );
    }, [activity, excelorConversationId, scopedPromptHistory, scopedSubagents]);

    useEffect(() => {
        if (!expandedPromptId) return;
        const stillVisible = scopedPromptHistory.some((entry) => entry.id === expandedPromptId);
        if (!stillVisible) {
            setExpandedPromptId(null);
        }
    }, [expandedPromptId, scopedPromptHistory]);

    const promptBlocks = useMemo<PromptBlockData[]>(() => {
        const subagentById = new Map(scopedSubagents.map((subagent) => [subagent.id, subagent]));
        const sortedPromptHistory = [...scopedPromptHistory].sort((left, right) => {
            const timestampDelta = toTimestamp(left.createdAt) - toTimestamp(right.createdAt);
            if (timestampDelta !== 0) return timestampDelta;
            return left.id.localeCompare(right.id);
        });

        const promptsByAgent = new Map<string, ExcelorSubagentPromptEntry[]>();
        for (const promptEntry of sortedPromptHistory) {
            const existing = promptsByAgent.get(promptEntry.agentId) || [];
            existing.push(promptEntry);
            promptsByAgent.set(promptEntry.agentId, existing);
        }

        const activityByAgent = new Map<string, ExcelorActivityEntry[]>();
        for (const entry of scopedActivity) {
            if (!entry.sourceAgentId) continue;
            const existing = activityByAgent.get(entry.sourceAgentId) || [];
            existing.push(entry);
            activityByAgent.set(entry.sourceAgentId, existing);
        }
        for (const [agentId, entries] of activityByAgent.entries()) {
            entries.sort((left, right) => toTimestamp(left.createdAt) - toTimestamp(right.createdAt));
            activityByAgent.set(agentId, entries);
        }

        return sortedPromptHistory.map((promptEntry) => {
            const agentPrompts = promptsByAgent.get(promptEntry.agentId) || [];
            const promptIndex = agentPrompts.findIndex((entry) => entry.id === promptEntry.id);
            const nextPrompt = promptIndex >= 0 ? agentPrompts[promptIndex + 1] : undefined;
            const promptStartMs = toTimestamp(promptEntry.createdAt);
            const nextPromptStartMs = nextPrompt ? toTimestamp(nextPrompt.createdAt) : Number.POSITIVE_INFINITY;
            const subagent = subagentById.get(promptEntry.agentId);
            const agentActivity = activityByAgent.get(promptEntry.agentId) || [];
            const promptWindowActivity = agentActivity.filter((entry) => {
                const createdAtMs = toTimestamp(entry.createdAt);
                return createdAtMs >= promptStartMs && createdAtMs < nextPromptStartMs;
            });
            const terminalEntry = promptWindowActivity.find((entry) => getTerminalPromptStatus(entry));
            const terminalTimeMs = terminalEntry ? toTimestamp(terminalEntry.createdAt) : Number.POSITIVE_INFINITY;
            const blockActivity = promptWindowActivity.filter((entry) => toTimestamp(entry.createdAt) <= terminalTimeMs);
            const terminalStatus = getTerminalPromptStatus(terminalEntry);
            const latestActivityStatus = blockActivity[blockActivity.length - 1]?.status;

            let status: ExcelorSubagentPromptDisplayStatus = "running";
            if (terminalStatus) {
                status = terminalStatus;
            } else if (nextPrompt) {
                status = "updated";
            } else if (subagent?.status) {
                status = subagent.status;
            } else if (
                latestActivityStatus === "idle"
                || latestActivityStatus === "running"
                || latestActivityStatus === "waiting"
                || latestActivityStatus === "completed"
                || latestActivityStatus === "failed"
                || latestActivityStatus === "closed"
            ) {
                status = latestActivityStatus;
            }

            return {
                promptEntry,
                subagent,
                activity: blockActivity,
                status,
                summary: getPromptBlockSummary({
                    status,
                    activity: blockActivity,
                    subagent,
                }),
                createdAtMs: promptStartMs,
            };
        });
    }, [scopedActivity, scopedPromptHistory, scopedSubagents]);

    const promptBlocksById = useMemo(
        () => new Map(promptBlocks.map((block) => [block.promptEntry.id, block])),
        [promptBlocks],
    );

    const visibleSkillProposals = useMemo(
        () => skillProposals.filter((p) => !dismissedProposalIds.has(p.id)),
        [skillProposals, dismissedProposalIds],
    );

    const skillProposalsById = useMemo(
        () => new Map(visibleSkillProposals.map((p) => [p.id, p])),
        [visibleSkillProposals],
    );

    const visiblePlanProposals = useMemo(
        () => planProposals.filter((p) => !dismissedProposalIds.has(p.id)),
        [planProposals, dismissedProposalIds],
    );

    const planProposalsById = useMemo(
        () => new Map(visiblePlanProposals.map((p) => [p.id, p])),
        [visiblePlanProposals],
    );

    const handleDismissProposal = useCallback((id: string) => {
        setDismissedProposalIds((prev) => new Set([...prev, id]));
    }, []);

    useEffect(() => {
        const api = typeof window !== "undefined" ? window.electronAPI : undefined;
        if (!api?.onSkillEnvSecretRequest || !api?.onSkillScriptApprovalRequest) return;
        const offEnv = api.onSkillEnvSecretRequest((payload) => {
            setPendingEnvSecret((current) => {
                // If a dialog is already open, queue by overwriting only when no active request.
                if (current) return current;
                return {
                    requestId: payload.requestId,
                    name: payload.name,
                    description: payload.description,
                    skillName: payload.skillName,
                };
            });
        });
        const offApproval = api.onSkillScriptApprovalRequest((payload) => {
            setPendingScriptApprovals((prev) => {
                if (prev.some((r) => r.requestId === payload.requestId)) return prev;
                return [
                    ...prev,
                    {
                        requestId: payload.requestId,
                        skillName: payload.skillName,
                        skillPath: payload.skillPath,
                        transports: Array.isArray(payload.transports) ? payload.transports : [],
                    },
                ];
            });
        });
        return () => {
            try { offEnv?.(); } catch { /* ignore */ }
            try { offApproval?.(); } catch { /* ignore */ }
        };
    }, []);

    const handleEnvSecretSubmit = useCallback((value: string | null) => {
        setPendingEnvSecret((current) => {
            if (current) {
                try {
                    window.electronAPI?.submitSkillEnvSecret?.(current.requestId, value);
                } catch {
                    // ignore bridge failure; backend will time out.
                }
            }
            return null;
        });
    }, []);

    const handleScriptApprovalResolve = useCallback((requestId: string, approved: boolean) => {
        try {
            window.electronAPI?.submitSkillScriptApproval?.(requestId, approved);
        } catch {
            // ignore; backend will time out
        }
        setPendingScriptApprovals((prev) => prev.filter((r) => r.requestId !== requestId));
    }, []);

    const handlePlanRevisionRequest = useCallback((note: string) => {
        const trimmed = note.trim();
        if (!trimmed) return;
        aui.composer().setText(trimmed);
        window.setTimeout(() => {
            sendButtonRef.current?.click();
        }, 0);
    }, [aui]);

    const inlineMcpAppsBySessionId = useMemo(
        () => new Map(inlineMcpApps.map((entry) => [entry.sessionId, entry])),
        [inlineMcpApps],
    );

    const mergedItems = useMemo<InlineThreadRenderItem[]>(() => {
        return mergeInlineThreadItems({
            threadMessages,
            promptBlocks,
            visibleSkillProposals,
            visiblePlanProposals,
            inlineMcpApps: inlineMcpApps.map((entry) => ({
                sessionId: entry.sessionId,
                createdAtMs: entry.createdAtMs,
            })),
        }) as unknown as InlineThreadRenderItem[];
    }, [promptBlocks, threadMessages, visibleSkillProposals, visiblePlanProposals, inlineMcpApps]);

    return (
        <OpenPdfContext.Provider value={openPdf ?? null}>
        <ThreadPrimitive.Root className="aui-thread-root">
            <CitationUI />
            <QuestionFlowUI />
            <ThreadPrimitive.Viewport className="aui-thread-viewport">
                {pendingScriptApprovals.length > 0 ? (
                    <div className="aui-skill-script-approvals">
                        {pendingScriptApprovals.map((request) => (
                            <SkillScriptApprovalCard
                                key={`skill-script-approval-${request.requestId}`}
                                request={request}
                                onResolve={handleScriptApprovalResolve}
                            />
                        ))}
                    </div>
                ) : null}
                {mergedItems.map((item) => {
                    if (item.kind === "message") {
                        return (
                            <ThreadPrimitive.MessageByIndex
                                key={`message-${item.id}`}
                                index={item.index}
                                components={{
                                    EditComposer: MyEditComposer,
                                    UserMessage: MyUserMessage,
                                    AssistantMessage: MyAssistantMessage,
                                }}
                            />
                        );
                    }

                    if (item.kind === "mcp_app") {
                        const entry = inlineMcpAppsBySessionId.get(item.sessionId);
                        if (!entry) {
                            return null;
                        }
                        return (
                            <div key={`mcp-app-${entry.sessionId}`} className="aui-thread-mcp-app-row">
                                <div className="aui-inline-mcp-app-card">
                                    <div className="aui-inline-mcp-app-card-header">
                                        <span className="aui-inline-mcp-app-card-eyebrow">MCP · Canvas</span>
                                        <span className="aui-inline-mcp-app-card-title">{entry.appState.title}</span>
                                        <button
                                            type="button"
                                            className="aui-inline-mcp-app-card-close"
                                            title="Close canvas"
                                            onClick={entry.onClose}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                                <line x1="6" y1="6" x2="18" y2="18"></line>
                                            </svg>
                                        </button>
                                    </div>
                                    <McpAppPane
                                        appState={entry.appState}
                                        display="inline"
                                        hideCloseButton
                                        className="mcp-app-pane-thread-card"
                                        onClose={entry.onClose}
                                    />
                                </div>
                            </div>
                        );
                    }

                    if (item.kind === "skill_proposal") {
                        const proposal = skillProposalsById.get(item.id);
                        if (!proposal) return null;
                        return (
                            <div key={`skill-proposal-${proposal.id}`} className="aui-skill-proposal-wrap">
                                <SkillProposalCard proposal={proposal} onDismiss={handleDismissProposal} />
                            </div>
                        );
                    }

                    if (item.kind === "plan_proposal") {
                        const proposal = planProposalsById.get(item.id);
                        if (!proposal) return null;
                        return (
                            <div key={`plan-proposal-${proposal.id}`} className="aui-plan-proposal-wrap">
                                <PlanProposalCard
                                    proposal={proposal}
                                    onDismiss={handleDismissProposal}
                                    onRequestRevision={handlePlanRevisionRequest}
                                />
                            </div>
                        );
                    }

                    const promptBlock = promptBlocksById.get(item.promptId);
                    if (!promptBlock) {
                        return null;
                    }

                    return (
                        <ExcelorSubagentPromptBlock
                            key={`subagent-${promptBlock.promptEntry.id}`}
                            promptEntry={promptBlock.promptEntry}
                            subagent={promptBlock.subagent}
                            activity={promptBlock.activity}
                            status={promptBlock.status}
                            summary={promptBlock.summary}
                            isExpanded={expandedPromptId === promptBlock.promptEntry.id}
                            onToggle={() => {
                                setExpandedPromptId((current) => current === promptBlock.promptEntry.id ? null : promptBlock.promptEntry.id);
                            }}
                        />
                    );
                })}
            </ThreadPrimitive.Viewport>

            <div className="aui-suggestions">
                <ThreadPrimitive.Suggestions components={{ Suggestion: MySuggestion }} />
            </div>

            <div className="aui-composer-area">
                <ComposerPrimitive.Root className="aui-composer-root">
                    <div className="aui-composer-attachments">
                        <ComposerPrimitive.Attachments components={{ Attachment: AttachmentUI }} />
                    </div>

                    <ComposerWorkspaceMentions
                        className="aui-composer-input"
                        placeholder="Ask anything... Use the Plan switch or type /plan for planning mode."
                        rows={1}
                    />

                    <div className="aui-composer-toolbar">
                        <div className="aui-composer-toolbar-left">
                            <ComposerPrimitive.AddAttachment asChild>
                                <button className="aui-composer-attach" aria-label="Add attachment">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="12" y1="5" x2="12" y2="19" />
                                        <line x1="5" y1="12" x2="19" y2="12" />
                                    </svg>
                                </button>
                            </ComposerPrimitive.AddAttachment>

                            <PdfMentionTrigger />
                            <ComposerModelSelector />

                            {excelorPlanScope ? (
                                <div className="aui-plan-mode-toggle-wrap">
                                    <label
                                        className="aui-plan-mode-toggle"
                                        htmlFor={planSwitchId}
                                        title={
                                            !hasPlanModeIpc
                                                ? "Plan mode unavailable in this build"
                                                : planToggleBusy
                                                    ? "Updating plan mode…"
                                                    : undefined
                                        }
                                    >
                                        <span className="aui-plan-mode-toggle-label">Plan</span>
                                        <input
                                            id={planSwitchId}
                                            type="checkbox"
                                            role="switch"
                                            checked={planActive}
                                            onChange={handlePlanModeToggle}
                                            disabled={!hasPlanModeIpc || planToggleBusy}
                                            aria-checked={planActive}
                                            aria-label="Planning mode"
                                        />
                                        <span className="aui-plan-mode-toggle-track" aria-hidden />
                                    </label>
                                    {planModeToggleError ? (
                                        <span className="aui-plan-mode-toggle-error" role="alert">
                                            {planModeToggleError}
                                        </span>
                                    ) : null}
                                </div>
                            ) : null}

                            {agentConfig && (
                                <div className="aui-agent-dropdown" title={agentConfig.name}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "2px", color: "var(--text-muted)" }}>
                                        <polyline points="6 9 12 15 18 9" />
                                    </svg>
                                    <span style={{ color: agentConfig.color, display: "flex", alignItems: "center" }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: "4px" }}>
                                            <path d={agentConfig.icon} />
                                        </svg>
                                    </span>
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agentConfig.name}</span>
                                </div>
                            )}
                        </div>

                        <ComposerPrimaryAction buttonRef={sendButtonRef} />
                    </div>
                </ComposerPrimitive.Root>
            </div>

            <SelectionToolbarPrimitive.Root className="aui-selection-toolbar">
                <SelectionToolbarPrimitive.Quote className="aui-selection-quote">
                    Quote
                </SelectionToolbarPrimitive.Quote>
            </SelectionToolbarPrimitive.Root>
            {pendingEnvSecret ? (
                <SkillEnvVarPromptDialog
                    request={pendingEnvSecret}
                    onSubmit={handleEnvSecretSubmit}
                />
            ) : null}
        </ThreadPrimitive.Root>
        </OpenPdfContext.Provider>
    );
};

const MyUserMessage: FC = () => {
    return (
        <MessagePrimitive.Root className="aui-message aui-message-user">
            <div className="aui-message-content">
                <div className="aui-user-message-attachments-end">
                    <MessagePrimitive.Attachments components={{ Attachment: AttachmentUI }} />
                </div>
                <MessagePrimitive.Content />
            </div>
        </MessagePrimitive.Root>
    );
};

const MyAssistantMessage: FC = () => {
    const messageStatus = useAuiState((s: any) => s.message?.status);
    const wasInterrupted = messageStatus?.type === "incomplete" && messageStatus?.reason === "cancelled";

    return (
        <MessagePrimitive.Root className="aui-message aui-message-assistant">
            <MessagePrimitive.Content components={{
                Text: ({ text }) => <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
            }} />
            {wasInterrupted ? <p className="aui-message-interrupted">Interrupted</p> : null}
        </MessagePrimitive.Root>
    );
};

const ComposerPrimaryAction: FC<{ buttonRef: RefObject<HTMLButtonElement | null> }> = ({ buttonRef }) => {
    const isThreadRunning = useAuiState((s: any) => Boolean(s.thread?.isRunning));

    if (isThreadRunning) {
        return (
            <ComposerPrimitive.Cancel asChild>
                <button
                    className="aui-composer-send aui-composer-stop"
                    aria-label="Stop response"
                    title="Stop response"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <rect x="7" y="7" width="10" height="10" rx="1.5" />
                    </svg>
                </button>
            </ComposerPrimitive.Cancel>
        );
    }

    return (
        <ComposerPrimitive.Send asChild>
            <button
                ref={buttonRef}
                className="aui-composer-send"
                aria-label="Send message"
                title="Send message"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                </svg>
            </button>
        </ComposerPrimitive.Send>
    );
};

const MyEditComposer: FC = () => {
    return (
        <ComposerPrimitive.Root className="aui-edit-composer">
            <ComposerPrimitive.Input
                className="aui-edit-input"
                rows={1}
            />
            <div className="aui-edit-actions">
                <ComposerPrimitive.Send asChild>
                    <button className="aui-edit-save">Save</button>
                </ComposerPrimitive.Send>
                <ComposerPrimitive.Cancel asChild>
                    <button className="aui-edit-cancel">Cancel</button>
                </ComposerPrimitive.Cancel>
            </div>
        </ComposerPrimitive.Root>
    );
};

const MySuggestion: FC = () => {
    return (
        <SuggestionPrimitive.Trigger className="aui-suggestion-pill">
            <SuggestionPrimitive.Title />
        </SuggestionPrimitive.Trigger>
    );
};
