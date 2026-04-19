import type { MutableRefObject } from "react";
import { PLAN_MODE_ACTIVATED_MESSAGE, parsePlanSlashCommand } from "./plan-command";

type ExcelorStreamingTextContent = {
    type: "text";
    text: string;
};

type ExcelorStreamingDataContent = {
    type: "data";
    name?: string;
    data?: {
        fileName?: string;
        text?: string;
    };
};

type ExcelorStreamingMessage = {
    content?: ReadonlyArray<ExcelorStreamingTextContent | ExcelorStreamingDataContent | { type: string; [key: string]: unknown }>;
};

type ExcelorStreamingYield = {
    content: Array<ExcelorStreamingTextContent>;
};

export type ExcelorStreamingQueueItem =
    | { type: "delta"; text: string }
    | { type: "replace"; text: string }
    | { type: "done"; answer: string }
    | { type: "error"; message: string }
    | { type: "abort" };

export interface ExcelorStreamingOptions {
    messages: readonly ExcelorStreamingMessage[];
    requestedScope: ExcelorScope;
    runtimeLabel: string;
    emptyPromptText: string;
    includeFullPdfContextRef?: MutableRefObject<boolean>;
    fullPdfTextRef?: MutableRefObject<string>;
    abortSignal?: AbortSignal;
}

const EXCELOR_INACTIVITY_TIMEOUT_MS = 120_000;
export const EXCELOR_USER_ABORT_REASON = "Interrupted by user.";
export const EXCELOR_INACTIVITY_ABORT_REASON = "Excelor timed out after 120 seconds of inactivity.";

function toTextYield(text: string): ExcelorStreamingYield {
    return {
        content: [{ type: "text", text }],
    };
}

function createAbortError(message = EXCELOR_USER_ABORT_REASON): Error {
    if (typeof DOMException !== "undefined") {
        return new DOMException(message, "AbortError");
    }

    const error = new Error(message);
    error.name = "AbortError";
    return error;
}

export function isExcelorAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === "AbortError";
}

function getLastMessage(
    messages: readonly ExcelorStreamingMessage[],
): ExcelorStreamingMessage | undefined {
    return messages[messages.length - 1];
}

function buildComposerText(
    lastMessage?: ExcelorStreamingMessage,
): string {
    return (
        lastMessage?.content
            ?.filter((content): content is ExcelorStreamingTextContent => content.type === "text")
            .map((content) => content.text)
            .join("") ?? ""
    );
}

function prependPdfAttachmentContext(
    lastMessage: ExcelorStreamingMessage | undefined,
    userText: string,
): string {
    let nextText = userText;

    const pdfParts =
        lastMessage?.content?.filter(
            (content): content is ExcelorStreamingDataContent => content.type === "data" && content.name === "pdf",
        ) ?? [];

    for (const part of pdfParts) {
        const { fileName, text } = part.data ?? {};
        if (fileName && text != null) {
            nextText = `Context from PDF "${fileName}":\n"""${text}"""\n\n${nextText}`;
        }
    }

    return nextText;
}

export async function* streamExcelorAssistantTurn({
    messages,
    requestedScope,
    runtimeLabel,
    emptyPromptText,
    includeFullPdfContextRef,
    fullPdfTextRef,
    abortSignal,
}: ExcelorStreamingOptions): AsyncGenerator<ExcelorStreamingYield> {
    if (!window.electronAPI) {
        yield toTextYield("Electron API not available.");
        return;
    }

    const lastMessage = getLastMessage(messages);
    const composerText = buildComposerText(lastMessage);
    const planCommand = parsePlanSlashCommand(composerText);
    const launchPrompt = planCommand ? planCommand.prompt : composerText;

    if (planCommand) {
        if (!window.electronAPI.excelorEnterPlanMode) {
            yield toTextYield("Plan mode entry is not available in this build.");
            return;
        }

        let bootSnapshot: ExcelorSnapshot | null = null;
        try {
            bootSnapshot = await window.electronAPI.excelorBootstrap(requestedScope);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            yield toTextYield(`Error: ${message}`);
            return;
        }

        const planAlreadyActive = Boolean(bootSnapshot?.planMode?.active);

        if (!planAlreadyActive) {
            try {
                await window.electronAPI.excelorEnterPlanMode(requestedScope);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                yield toTextYield(`Error: ${message}`);
                return;
            }
        }

        if (!launchPrompt.trim()) {
            yield toTextYield(PLAN_MODE_ACTIVATED_MESSAGE);
            return;
        }
    }

    let userText = prependPdfAttachmentContext(lastMessage, launchPrompt);

    if (!userText.trim()) {
        yield toTextYield(emptyPromptText);
        return;
    }

    if (includeFullPdfContextRef?.current && fullPdfTextRef?.current) {
        userText = `Context from PDF:\n"""${fullPdfTextRef.current}"""\n\n${userText}`;
        includeFullPdfContextRef.current = false;
    }

    const queue: ExcelorStreamingQueueItem[] = [];
    let notifyQueue: (() => void) | null = null;
    const pushQueue = (item: ExcelorStreamingQueueItem) => {
        queue.push(item);
        if (notifyQueue) {
            const notify = notifyQueue;
            notifyQueue = null;
            notify();
        }
    };
    const waitForQueue = () => new Promise<void>((resolve) => {
        notifyQueue = resolve;
    });

    let settled = false;
    let launchedTurnId: string | null = null;
    let sawRunningSnapshot = false;
    let latestSnapshot: ExcelorSnapshot | null = null;
    let lastDraftText = "";
    let emittedText = "";
    let acceptedScope: ExcelorScope = requestedScope;
    let watchdogId: number | null = null;
    let unsubscribe: (() => void) | null = null;
    let abortRequested = false;

    const clearWatchdog = () => {
        if (watchdogId !== null) {
            window.clearTimeout(watchdogId);
            watchdogId = null;
        }
    };

    const detachRuntimeListeners = () => {
        clearWatchdog();
        unsubscribe?.();
        unsubscribe = null;
    };

    function cleanupAbortListener() {
        abortSignal?.removeEventListener("abort", handleAbortSignal);
    }

    const finish = (item: ExcelorStreamingQueueItem) => {
        if (settled) return;
        settled = true;
        detachRuntimeListeners();
        cleanupAbortListener();
        pushQueue(item);
    };

    const finishWithInactivityTimeout = async () => {
        if (settled) return;

        if (launchedTurnId && latestSnapshot?.activeTurnId && latestSnapshot.activeTurnId !== launchedTurnId) {
            finish({ type: "error", message: "Excelor run was interrupted by a newer request." });
            return;
        }

        try {
            await window.electronAPI.excelorAbortTurn(acceptedScope, EXCELOR_INACTIVITY_ABORT_REASON);
        } catch (_error) {
            // Best effort: the runtime may have already exited.
        }

        finish({
            type: "error",
            message: EXCELOR_INACTIVITY_ABORT_REASON,
        });
    };

    const touchWatchdog = () => {
        if (settled) return;
        clearWatchdog();
        watchdogId = window.setTimeout(() => {
            void finishWithInactivityTimeout();
        }, EXCELOR_INACTIVITY_TIMEOUT_MS);
    };

    const maybeEmitDraftDelta = (snapshot: ExcelorSnapshot) => {
        if (!launchedTurnId) return;
        if (snapshot.activeTurnId !== launchedTurnId) return;

        const draft = String(snapshot.draftAssistantText || "");
        if (!draft) {
            if (lastDraftText) {
                lastDraftText = "";
                pushQueue({ type: "replace", text: "" });
            }
            lastDraftText = "";
            return;
        }
        if (draft === lastDraftText) return;

        const delta = draft.startsWith(lastDraftText)
            ? draft.slice(lastDraftText.length)
            : draft;
        lastDraftText = draft;

        if (delta) {
            touchWatchdog();
            pushQueue({ type: "delta", text: delta });
        }
    };

    const maybeComplete = (snapshot: ExcelorSnapshot) => {
        latestSnapshot = snapshot;
        maybeEmitDraftDelta(snapshot);

        if (launchedTurnId && snapshot.activeTurnId === launchedTurnId) {
            sawRunningSnapshot = true;
        }
        if (!launchedTurnId || !sawRunningSnapshot) return;
        if (snapshot.status !== "idle" || snapshot.activeTurnId) return;

        if (snapshot.lastError) {
            if (abortRequested && snapshot.lastError === EXCELOR_USER_ABORT_REASON) {
                finish({ type: "abort" });
                return;
            }
            finish({ type: "error", message: snapshot.lastError });
            return;
        }

        const lastMessage = snapshot.messages[snapshot.messages.length - 1];
        const answer = lastMessage?.role === "assistant" ? lastMessage.text : "";
        finish({ type: "done", answer });
    };

    function handleAbortSignal() {
        if (abortRequested || settled) return;
        abortRequested = true;
        detachRuntimeListeners();
        cleanupAbortListener();

        void (async () => {
            try {
                await window.electronAPI.excelorAbortTurn(acceptedScope, EXCELOR_USER_ABORT_REASON);
            } catch (_error) {
                // Best effort: the runtime may have already exited.
            }

            if (settled) return;
            settled = true;
            pushQueue({ type: "abort" });
        })();
    }

    unsubscribe = window.electronAPI.onExcelorSnapshot((snapshot) => {
        if (snapshot.scope !== acceptedScope) return;
        if (launchedTurnId && snapshot.activeTurnId && snapshot.activeTurnId !== launchedTurnId) {
            finish({ type: "error", message: "Excelor run was interrupted by a newer request." });
            return;
        }
        if (!launchedTurnId || snapshot.activeTurnId === launchedTurnId || (!snapshot.activeTurnId && snapshot.status === "idle")) {
            touchWatchdog();
        }
        maybeComplete(snapshot);
    });

    abortSignal?.addEventListener("abort", handleAbortSignal, { once: true });
    if (abortSignal?.aborted) {
        handleAbortSignal();
    }

    if (!abortRequested) {
        touchWatchdog();

        void window.electronAPI.excelorLaunch(userText, requestedScope)
            .then((launchSnapshot) => {
                if (abortRequested || settled) {
                    return;
                }

                if (launchSnapshot.scope !== acceptedScope) {
                    console.warn(
                        `[Excelor] Scope mismatch detected in ${runtimeLabel}. Requested '${requestedScope}', received '${launchSnapshot.scope}'. Auto-recovering to '${launchSnapshot.scope}'.`,
                    );
                    acceptedScope = launchSnapshot.scope;
                }

                launchedTurnId = launchSnapshot.activeTurnId;
                if (!launchedTurnId) {
                    throw new Error(launchSnapshot.lastError || "Excelor did not start a turn.");
                }

                touchWatchdog();
                if (latestSnapshot?.activeTurnId === launchedTurnId) {
                    sawRunningSnapshot = true;
                }

                maybeComplete(launchSnapshot);
            })
            .catch((error: unknown) => {
                if (abortRequested || settled) {
                    return;
                }

                const message = error instanceof Error ? error.message : String(error);
                finish({ type: "error", message });
            });
    }

    while (true) {
        if (queue.length === 0) {
            await waitForQueue();
            continue;
        }

        const next = queue.shift();
        if (!next) continue;

        if (next.type === "delta") {
            emittedText += next.text;
            // @assistant-ui expects each streamed yield to contain the full accumulated message text.
            yield toTextYield(emittedText);
            continue;
        }

        if (next.type === "replace") {
            emittedText = next.text;
            yield toTextYield(emittedText);
            continue;
        }

        if (next.type === "error") {
            if (!emittedText) {
                yield toTextYield(`Error: ${next.message}`);
            } else {
                yield toTextYield(`${emittedText}\n\nError: ${next.message}`);
            }
            return;
        }

        if (next.type === "abort") {
            throw createAbortError();
        }

        const answer = next.answer || "Excelor did not return a response.";
        if (!emittedText) {
            yield toTextYield(answer);
            return;
        }

        if (answer.startsWith(emittedText)) {
            yield toTextYield(answer);
        } else if (answer !== emittedText) {
            yield toTextYield(`${emittedText}\n\n${answer}`);
        } else {
            yield toTextYield(emittedText);
        }
        return;
    }
}
