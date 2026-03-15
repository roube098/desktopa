import {
    ThreadPrimitive,
    MessagePrimitive,
    ComposerPrimitive,
    SelectionToolbarPrimitive,
    SuggestionPrimitive,
    AttachmentPrimitive,
    type Toolkit,
    Tools
} from "@assistant-ui/react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { type FC } from "react";
import { Citation } from "./tool-ui/citation";
import { safeParseSerializableCitation } from "./tool-ui/citation/schema";
import { makeAssistantToolUI } from "@assistant-ui/react";
import type { AgentConfig } from "../types/agent-types";
import { ComposerModelSelector } from "./ComposerModelSelector";
import { QuestionFlow } from "./tool-ui/question-flow";
import { safeParseSerializableQuestionFlow } from "./tool-ui/question-flow/schema";

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

/* ── Attachment UI ────────────────────────────────────────── */
const AttachmentUI: FC = () => {
    return (
        <AttachmentPrimitive.Root className="aui-attachment-root">
            <div className="aui-attachment-thumb">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>

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

/* ── Thread Props ─────────────────────────────────────────── */
interface MyThreadProps {
    agentConfig?: AgentConfig;
    editorLoaded?: boolean;
}

export const MyThread: FC<MyThreadProps> = ({ agentConfig, editorLoaded }) => {
    return (
        <ThreadPrimitive.Root className="aui-thread-root">
            <CitationUI />
            <QuestionFlowUI />
            <ThreadPrimitive.Viewport className="aui-thread-viewport">


                <ThreadPrimitive.Messages
                    components={{
                        EditComposer: MyEditComposer,
                        UserMessage: MyUserMessage,
                        AssistantMessage: MyAssistantMessage,
                    }}
                />
            </ThreadPrimitive.Viewport>

            <div className="aui-suggestions">
                <ThreadPrimitive.Suggestions components={{ Suggestion: MySuggestion }} />
            </div>

            {/* Composer */}
            <div className="aui-composer-area">
                <ComposerPrimitive.Root className="aui-composer-root">
                    <div className="aui-composer-attachments">
                        <ComposerPrimitive.Attachments components={{ Attachment: AttachmentUI }} />
                    </div>

                    <ComposerPrimitive.Input
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

                            <ComposerModelSelector />

                            {agentConfig && (
                                <div className="aui-agent-dropdown" title={agentConfig.name}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '2px', color: 'var(--text-muted)' }}>
                                        <polyline points="6 9 12 15 18 9" />
                                    </svg>
                                    <span style={{ color: agentConfig.color, display: 'flex', alignItems: 'center' }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '4px' }}>
                                            <path d={agentConfig.icon} />
                                        </svg>
                                    </span>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agentConfig.name}</span>
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

            {/* Floating toolbar — appears when text is selected in a message */}
            <SelectionToolbarPrimitive.Root className="aui-selection-toolbar">
                <SelectionToolbarPrimitive.Quote className="aui-selection-quote">
                    Quote
                </SelectionToolbarPrimitive.Quote>
            </SelectionToolbarPrimitive.Root>
        </ThreadPrimitive.Root>
    );
};

/* ── User Message ─────────────────────────────────────────── */
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

/* ── Assistant Message ────────────────────────────────────── */
const MyAssistantMessage: FC = () => {
    return (
        <MessagePrimitive.Root className="aui-message aui-message-assistant">
            <MessagePrimitive.Content components={{
                Text: ({ text }) => <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
            }} />
        </MessagePrimitive.Root>
    );
};

/* ── Edit Composer (inline editing of a past message) ─────── */
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

/* ── Suggestion Pill ──────────────────────────────────────── */
const MySuggestion: FC = () => {
    return (
        <SuggestionPrimitive.Trigger className="aui-suggestion-pill">
            <SuggestionPrimitive.Title />
        </SuggestionPrimitive.Trigger>
    );
};
