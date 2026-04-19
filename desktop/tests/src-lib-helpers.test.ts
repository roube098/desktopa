import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeInlineThreadItems } from "../src/lib/inline-thread-merge";
import { getMcpAppDisplayHostFields } from "../src/lib/mcp-app-host-context";
import { PLAN_MODE_ACTIVATED_MESSAGE, parsePlanSlashCommand } from "../src/lib/plan-command";
import {
    EXCELOR_INACTIVITY_ABORT_REASON,
    EXCELOR_USER_ABORT_REASON,
    streamExcelorAssistantTurn,
} from "../src/lib/excelor-streaming";

test("mergeInlineThreadItems interleaves mcp_app by createdAtMs", () => {
    const merged = mergeInlineThreadItems({
        threadMessages: [
            { id: "a", createdAt: new Date("2026-01-01T12:00:00.000Z") },
            { id: "b", createdAt: new Date("2026-01-01T12:00:05.000Z") },
        ],
        promptBlocks: [],
        visibleSkillProposals: [],
        inlineMcpApps: [
            { sessionId: "s1", createdAtMs: Date.parse("2026-01-01T12:00:02.000Z") },
        ],
    });

    assert.equal(merged.length, 3);
    assert.equal(merged[0].kind, "message");
    assert.equal(merged[1].kind, "mcp_app");
    if (merged[1].kind === "mcp_app") {
        assert.equal(merged[1].sessionId, "s1");
    }
    assert.equal(merged[2].kind, "message");
});

test("mergeInlineThreadItems sorts mcp_app after earlier messages and before later ones", () => {
    const merged = mergeInlineThreadItems({
        threadMessages: [{ id: "m1", createdAt: "2026-04-10T10:00:00.000Z" }],
        promptBlocks: [],
        visibleSkillProposals: [],
        inlineMcpApps: [{ sessionId: "td", createdAtMs: Date.parse("2026-04-10T10:00:01.000Z") }],
    });
    assert.deepEqual(
        merged.map((row) => row.kind),
        ["message", "mcp_app"],
    );
});

test("getMcpAppDisplayHostFields(inline) reports inline-only modes", () => {
    const fields = getMcpAppDisplayHostFields("inline");
    assert.equal(fields.displayMode, "inline");
    assert.deepEqual(fields.availableDisplayModes, ["inline"]);
});

test("getMcpAppDisplayHostFields(fullscreen) reports fullscreen-only modes", () => {
    const fields = getMcpAppDisplayHostFields("fullscreen");
    assert.equal(fields.displayMode, "fullscreen");
    assert.deepEqual(fields.availableDisplayModes, ["fullscreen"]);
});

test("parsePlanSlashCommand accepts /plan with optional trailing prompt", () => {
    assert.deepEqual(parsePlanSlashCommand("/plan"), {
        command: "plan",
        prompt: "",
    });
    assert.deepEqual(parsePlanSlashCommand("/PLAN   build auth"), {
        command: "plan",
        prompt: "build auth",
    });
    assert.deepEqual(parsePlanSlashCommand("/plan   line one\nline two"), {
        command: "plan",
        prompt: "line one\nline two",
    });
});

test("parsePlanSlashCommand rejects non-command and partial-command inputs", () => {
    assert.equal(parsePlanSlashCommand(""), null);
    assert.equal(parsePlanSlashCommand("hello /plan"), null);
    assert.equal(parsePlanSlashCommand("/planner"), null);
    assert.equal(parsePlanSlashCommand(" /plan"), null);
});

function createSnapshot(overrides: Record<string, unknown> = {}) {
    return {
        id: "excelor-thread-1",
        scope: "main",
        status: "idle",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        activeTurnId: null,
        messages: [],
        activity: [],
        lastError: "",
        subagents: [],
        subagentPrompts: [],
        skillProposals: [],
        planMode: {
            active: false,
            status: "inactive",
            revision: 0,
            previousMode: "default",
            approvedPlan: null,
        },
        planProposals: [],
        context: {},
        draftAssistantText: "",
        conversationId: "conv-1",
        ...overrides,
    };
}

async function collectStreamTexts(generator: AsyncGenerator<{ content: Array<{ text: string }> }>) {
    const texts: string[] = [];
    for await (const chunk of generator) {
        texts.push(chunk.content.map((entry) => entry.text).join(""));
    }
    return texts;
}

async function collectStreamOutcome(generator: AsyncGenerator<{ content: Array<{ text: string }> }>) {
    const texts: string[] = [];
    try {
        for await (const chunk of generator) {
            texts.push(chunk.content.map((entry) => entry.text).join(""));
        }
        return { texts, error: null as unknown };
    } catch (error: unknown) {
        return { texts, error };
    }
}

test("streamExcelorAssistantTurn handles /plan without launching a turn", async () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    let enterPlanCalls = 0;
    let launchCalls = 0;

    (globalThis as { window: unknown }).window = {
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
        electronAPI: {
            excelorBootstrap: async () => createSnapshot(),
            excelorEnterPlanMode: async () => {
                enterPlanCalls += 1;
                return createSnapshot({
                    planMode: {
                        active: true,
                        status: "active",
                        revision: 0,
                        previousMode: "default",
                        approvedPlan: null,
                    },
                });
            },
            excelorLaunch: async () => {
                launchCalls += 1;
                return createSnapshot();
            },
        },
    };

    try {
        const texts = await collectStreamTexts(streamExcelorAssistantTurn({
            messages: [{ content: [{ type: "text", text: "/plan" }] }],
            requestedScope: "main",
            runtimeLabel: "test runtime",
            emptyPromptText: "Please enter a question.",
        }));

        assert.deepEqual(texts, [PLAN_MODE_ACTIVATED_MESSAGE]);
        assert.equal(enterPlanCalls, 1);
        assert.equal(launchCalls, 0);
    } finally {
        (globalThis as { window?: unknown }).window = originalWindow;
    }
});

test("streamExcelorAssistantTurn enters plan mode and launches with the stripped prompt", async () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    const launchCalls: Array<{ input: string; scope: string }> = [];
    let enterPlanCalls = 0;
    let snapshotListener: ((snapshot: unknown) => void) | null = null;

    (globalThis as { window: unknown }).window = {
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
        electronAPI: {
            onExcelorSnapshot: (callback: (snapshot: unknown) => void) => {
                snapshotListener = callback;
                return () => {
                    snapshotListener = null;
                };
            },
            excelorBootstrap: async () => createSnapshot(),
            excelorEnterPlanMode: async () => {
                enterPlanCalls += 1;
                return createSnapshot({
                    planMode: {
                        active: true,
                        status: "active",
                        revision: 0,
                        previousMode: "default",
                        approvedPlan: null,
                    },
                });
            },
            excelorLaunch: async (input: string, scope = "main") => {
                launchCalls.push({ input, scope });
                globalThis.setTimeout(() => {
                    snapshotListener?.(createSnapshot({
                        scope,
                        status: "idle",
                        messages: [{ role: "assistant", text: "Planning response" }],
                    }));
                }, 0);
                return createSnapshot({
                    scope,
                    status: "running",
                    activeTurnId: "turn-1",
                });
            },
            excelorAbortTurn: async () => createSnapshot(),
        },
    };

    try {
        const texts = await collectStreamTexts(streamExcelorAssistantTurn({
            messages: [{ content: [{ type: "text", text: "/plan build an auth migration" }] }],
            requestedScope: "main",
            runtimeLabel: "test runtime",
            emptyPromptText: "Please enter a question.",
        }));

        assert.equal(enterPlanCalls, 1);
        assert.deepEqual(launchCalls, [{ input: "build an auth migration", scope: "main" }]);
        assert.equal(texts.at(-1), "Planning response");
    } finally {
        (globalThis as { window?: unknown }).window = originalWindow;
    }
});

test("streamExcelorAssistantTurn leaves non-command prompts on the normal launch path", async () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    const launchCalls: Array<{ input: string; scope: string }> = [];
    let enterPlanCalls = 0;
    let snapshotListener: ((snapshot: unknown) => void) | null = null;

    (globalThis as { window: unknown }).window = {
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
        electronAPI: {
            onExcelorSnapshot: (callback: (snapshot: unknown) => void) => {
                snapshotListener = callback;
                return () => {
                    snapshotListener = null;
                };
            },
            excelorEnterPlanMode: async () => {
                enterPlanCalls += 1;
                return createSnapshot();
            },
            excelorLaunch: async (input: string, scope = "main") => {
                launchCalls.push({ input, scope });
                globalThis.setTimeout(() => {
                    snapshotListener?.(createSnapshot({
                        scope,
                        status: "idle",
                        messages: [{ role: "assistant", text: "Normal response" }],
                    }));
                }, 0);
                return createSnapshot({
                    scope,
                    status: "running",
                    activeTurnId: "turn-2",
                });
            },
            excelorAbortTurn: async () => createSnapshot(),
        },
    };

    try {
        const texts = await collectStreamTexts(streamExcelorAssistantTurn({
            messages: [{ content: [{ type: "text", text: "Build an auth migration" }] }],
            requestedScope: "main",
            runtimeLabel: "test runtime",
            emptyPromptText: "Please enter a question.",
        }));

        assert.equal(enterPlanCalls, 0);
        assert.deepEqual(launchCalls, [{ input: "Build an auth migration", scope: "main" }]);
        assert.equal(texts.at(-1), "Normal response");
    } finally {
        (globalThis as { window?: unknown }).window = originalWindow;
    }
});

test("streamExcelorAssistantTurn aborts the live run on user stop without appending error text", async () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    let snapshotListener: ((snapshot: unknown) => void) | null = null;
    const abortCalls: Array<{ scope: string; reason?: string }> = [];
    const abortController = new AbortController();

    (globalThis as { window: unknown }).window = {
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
        electronAPI: {
            onExcelorSnapshot: (callback: (snapshot: unknown) => void) => {
                snapshotListener = callback;
                return () => {
                    snapshotListener = null;
                };
            },
            excelorLaunch: async (_input: string, scope = "main") => {
                globalThis.setTimeout(() => {
                    snapshotListener?.(createSnapshot({
                        scope,
                        status: "running",
                        activeTurnId: "turn-stop",
                        draftAssistantText: "Partial output",
                    }));
                    abortController.abort();
                    snapshotListener?.(createSnapshot({
                        scope,
                        status: "idle",
                        lastError: EXCELOR_USER_ABORT_REASON,
                        messages: [{ role: "assistant", text: "Partial output" }],
                    }));
                }, 0);

                return createSnapshot({
                    scope,
                    status: "running",
                    activeTurnId: "turn-stop",
                });
            },
            excelorAbortTurn: async (scope = "main", reason?: string) => {
                abortCalls.push({ scope, reason });
                return createSnapshot({
                    scope,
                    status: "idle",
                    lastError: String(reason || ""),
                });
            },
        },
    };

    try {
        const { texts, error } = await collectStreamOutcome(streamExcelorAssistantTurn({
            messages: [{ content: [{ type: "text", text: "Stop this run" }] }],
            requestedScope: "main",
            runtimeLabel: "test runtime",
            emptyPromptText: "Please enter a question.",
            abortSignal: abortController.signal,
        }));

        assert.equal(texts.at(-1), "Partial output");
        assert.equal(texts.some((text) => text.includes("Error:")), false);
        assert.deepEqual(abortCalls, [{ scope: "main", reason: EXCELOR_USER_ABORT_REASON }]);
        assert.equal((error as Error | null)?.name, "AbortError");
    } finally {
        (globalThis as { window?: unknown }).window = originalWindow;
    }
});

test("streamExcelorAssistantTurn uses the inactivity timeout reason when aborting an idle run", async () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    const abortCalls: Array<{ scope: string; reason?: string }> = [];

    (globalThis as { window: unknown }).window = {
        setTimeout: ((callback: TimerHandler) => {
            queueMicrotask(() => {
                if (typeof callback === "function") {
                    callback();
                }
            });
            return 1;
        }) as typeof globalThis.setTimeout,
        clearTimeout: (() => undefined) as typeof globalThis.clearTimeout,
        electronAPI: {
            onExcelorSnapshot: () => () => undefined,
            excelorLaunch: async (_input: string, scope = "main") => createSnapshot({
                scope,
                status: "running",
                activeTurnId: "turn-timeout",
            }),
            excelorAbortTurn: async (scope = "main", reason?: string) => {
                abortCalls.push({ scope, reason });
                return createSnapshot({
                    scope,
                    status: "idle",
                    lastError: String(reason || ""),
                });
            },
        },
    };

    try {
        const texts = await collectStreamTexts(streamExcelorAssistantTurn({
            messages: [{ content: [{ type: "text", text: "Wait forever" }] }],
            requestedScope: "main",
            runtimeLabel: "test runtime",
            emptyPromptText: "Please enter a question.",
        }));

        assert.deepEqual(abortCalls, [{ scope: "main", reason: EXCELOR_INACTIVITY_ABORT_REASON }]);
        assert.equal(texts.at(-1), `Error: ${EXCELOR_INACTIVITY_ABORT_REASON}`);
    } finally {
        (globalThis as { window?: unknown }).window = originalWindow;
    }
});
