import type { MutableRefObject } from "react";

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
    | { type: "error"; message: string };

export interface ExcelorStreamingOptions {
    messages: readonly ExcelorStreamingMessage[];
    requestedScope: ExcelorScope;
    runtimeLabel: string;
    emptyPromptText: string;
    includeFullPdfContextRef?: MutableRefObject<boolean>;
    fullPdfTextRef?: MutableRefObject<string>;
}

const EXCELOR_INACTIVITY_TIMEOUT_MS = 120_000;

function toTextYield(text: string): ExcelorStreamingYield {
    return {
        content: [{ type: "text", text }],
    };
}

function buildUserText(
    messages: readonly ExcelorStreamingMessage[],
): string {
    const lastMessage = messages[messages.length - 1];
    let userText =
        lastMessage?.content
            ?.filter((content): content is ExcelorStreamingTextContent => content.type === "text")
            .map((content) => content.text)
            .join("") ?? "";

    const pdfParts =
        lastMessage?.content?.filter(
            (content): content is ExcelorStreamingDataContent => content.type === "data" && content.name === "pdf",
        ) ?? [];

    for (const part of pdfParts) {
        const { fileName, text } = part.data ?? {};
        if (fileName && text != null) {
            userText = `Context from PDF "${fileName}":\n"""${text}"""\n\n${userText}`;
        }
    }

    return userText;
}

export async function* streamExcelorAssistantTurn({
    messages,
    requestedScope,
    runtimeLabel,
    emptyPromptText,
    includeFullPdfContextRef,
    fullPdfTextRef,
}: ExcelorStreamingOptions): AsyncGenerator<ExcelorStreamingYield> {
    let userText = buildUserText(messages);

    if (!userText.trim()) {
        yield toTextYield(emptyPromptText);
        return;
    }

    if (includeFullPdfContextRef?.current && fullPdfTextRef?.current) {
        userText = `Context from PDF:\n"""${fullPdfTextRef.current}"""\n\n${userText}`;
        includeFullPdfContextRef.current = false;
    }

    if (!window.electronAPI) {
        yield toTextYield("Electron API not available.");
        return;
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

    const clearWatchdog = () => {
        if (watchdogId !== null) {
            window.clearTimeout(watchdogId);
            watchdogId = null;
        }
    };

    const finish = (item: ExcelorStreamingQueueItem) => {
        if (settled) return;
        settled = true;
        clearWatchdog();
        unsubscribe();
        pushQueue(item);
    };

    const finishWithInactivityTimeout = async () => {
        if (settled) return;

        if (launchedTurnId && latestSnapshot?.activeTurnId && latestSnapshot.activeTurnId !== launchedTurnId) {
            finish({ type: "error", message: "Excelor run was interrupted by a newer request." });
            return;
        }

        try {
            await window.electronAPI.excelorAbortTurn(acceptedScope);
        } catch (_error) {
            // Best effort: the runtime may have already exited.
        }

        finish({
            type: "error",
            message: "Excelor timed out after 120 seconds of inactivity.",
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
            finish({ type: "error", message: snapshot.lastError });
            return;
        }

        const lastMessage = snapshot.messages[snapshot.messages.length - 1];
        const answer = lastMessage?.role === "assistant" ? lastMessage.text : "";
        finish({ type: "done", answer });
    };

    const unsubscribe = window.electronAPI.onExcelorSnapshot((snapshot) => {
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

    touchWatchdog();

    void window.electronAPI.excelorLaunch(userText, requestedScope)
        .then((launchSnapshot) => {
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
            const message = error instanceof Error ? error.message : String(error);
            finish({ type: "error", message });
        });

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
