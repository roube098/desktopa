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
import { type FC, useRef, useCallback, createContext, useContext, useEffect, useMemo, useState } from "react";
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
import type { SkillProposalEntry } from "../types/skills";
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
    excelorConversationId,
    inlineMcpApps = [],
}) => {
    const [expandedPromptId, setExpandedPromptId] = useState<string | null>(null);
    const [dismissedProposalIds, setDismissedProposalIds] = useState<Set<string>>(() => new Set());
    const threadMessages = useAuiState((s: any) => Array.isArray(s.thread?.messages) ? s.thread.messages : []);

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

    const handleDismissProposal = useCallback((id: string) => {
        setDismissedProposalIds((prev) => new Set([...prev, id]));
    }, []);

    const inlineMcpAppsBySessionId = useMemo(
        () => new Map(inlineMcpApps.map((entry) => [entry.sessionId, entry])),
        [inlineMcpApps],
    );

    const mergedItems = useMemo<InlineThreadRenderItem[]>(() => {
        return mergeInlineThreadItems({
            threadMessages,
            promptBlocks,
            visibleSkillProposals,
            inlineMcpApps: inlineMcpApps.map((entry) => ({
                sessionId: entry.sessionId,
                createdAtMs: entry.createdAtMs,
            })),
        }) as unknown as InlineThreadRenderItem[];
    }, [promptBlocks, threadMessages, visibleSkillProposals, inlineMcpApps]);

    return (
        <OpenPdfContext.Provider value={openPdf ?? null}>
        <ThreadPrimitive.Root className="aui-thread-root">
            <CitationUI />
            <QuestionFlowUI />
            <ThreadPrimitive.Viewport className="aui-thread-viewport">
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
                        placeholder="Ask anything..."
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

                        <ComposerPrimitive.Send asChild>
                            <button className="aui-composer-send">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="19" x2="12" y2="5" />
                                    <polyline points="5 12 12 5 19 12" />
                                </svg>
                            </button>
                        </ComposerPrimitive.Send>
                    </div>
                </ComposerPrimitive.Root>
            </div>

            <SelectionToolbarPrimitive.Root className="aui-selection-toolbar">
                <SelectionToolbarPrimitive.Quote className="aui-selection-quote">
                    Quote
                </SelectionToolbarPrimitive.Quote>
            </SelectionToolbarPrimitive.Root>
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
    return (
        <MessagePrimitive.Root className="aui-message aui-message-assistant">
            <MessagePrimitive.Content components={{
                Text: ({ text }) => <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
            }} />
        </MessagePrimitive.Root>
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
