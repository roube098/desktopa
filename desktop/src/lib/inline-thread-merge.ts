/**
 * Pure merge/sort for main-thread timeline items (messages, subagents, skill proposals, inline MCP apps).
 */

export type MergedInlineThreadItem =
    | {
        kind: 'message';
        id: string;
        createdAtMs: number;
        index: number;
        order: number;
    }
    | {
        kind: 'subagent';
        id: string;
        promptId: string;
        createdAtMs: number;
        order: number;
    }
    | {
        kind: 'skill_proposal';
        id: string;
        proposalId: string;
        createdAtMs: number;
        order: number;
    }
    | {
        kind: 'plan_proposal';
        id: string;
        proposalId: string;
        createdAtMs: number;
        order: number;
    }
    | {
        kind: 'mcp_app';
        id: string;
        sessionId: string;
        createdAtMs: number;
        order: number;
    };

export function toTimestamp(value: unknown): number {
    if (value instanceof Date) {
        return value.getTime();
    }
    const timestamp = Date.parse(String(value || ''));
    return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function mergeInlineThreadItems(params: {
    threadMessages: unknown[];
    promptBlocks: { createdAtMs: number; promptEntry: { id: string } }[];
    visibleSkillProposals: { id: string; createdAt: unknown }[];
    visiblePlanProposals?: { id: string; createdAt: unknown }[];
    inlineMcpApps?: { sessionId: string; createdAtMs: number }[];
}): MergedInlineThreadItem[] {
    const {
        threadMessages,
        promptBlocks,
        visibleSkillProposals,
        visiblePlanProposals = [],
        inlineMcpApps = [],
    } = params;

    const messageItems: MergedInlineThreadItem[] = threadMessages.map((message: any, index: number) => ({
        kind: 'message',
        id: String(message?.id || `message-${index}`),
        createdAtMs: toTimestamp(message?.createdAt),
        index,
        order: index,
    }));
    const subagentItems: MergedInlineThreadItem[] = promptBlocks.map((block, index) => ({
        kind: 'subagent',
        id: block.promptEntry.id,
        promptId: block.promptEntry.id,
        createdAtMs: block.createdAtMs,
        order: index,
    }));
    const proposalItems: MergedInlineThreadItem[] = visibleSkillProposals.map((proposal, index) => ({
        kind: 'skill_proposal',
        id: proposal.id,
        proposalId: proposal.id,
        createdAtMs: toTimestamp(proposal.createdAt),
        order: index,
    }));
    const planProposalItems: MergedInlineThreadItem[] = visiblePlanProposals.map((proposal, index) => ({
        kind: 'plan_proposal',
        id: proposal.id,
        proposalId: proposal.id,
        createdAtMs: toTimestamp(proposal.createdAt),
        order: index,
    }));
    const mcpItems: MergedInlineThreadItem[] = inlineMcpApps.map((entry, index) => ({
        kind: 'mcp_app',
        id: `mcp-app-${entry.sessionId}`,
        sessionId: entry.sessionId,
        createdAtMs: entry.createdAtMs,
        order: index,
    }));

    return [...messageItems, ...subagentItems, ...proposalItems, ...planProposalItems, ...mcpItems].sort((left, right) => {
        const timestampDelta = left.createdAtMs - right.createdAtMs;
        if (timestampDelta !== 0) return timestampDelta;
        if (left.kind !== right.kind) {
            if (left.kind === 'message') return -1;
            if (right.kind === 'message') return 1;
            return String(left.id).localeCompare(String(right.id));
        }
        return left.order - right.order;
    });
}
