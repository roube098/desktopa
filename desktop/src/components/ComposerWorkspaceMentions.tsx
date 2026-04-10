import { ComposerPrimitive } from "@assistant-ui/react";
import { useAui, useAuiState } from "@assistant-ui/store";
import {
    type FC,
    type KeyboardEvent,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    formatInsertedWorkspaceReference,
    getActiveWorkspaceMention,
    rankWorkspaceFiles,
    type WorkspaceMentionMatch,
} from "../lib/workspace-file-mentions";
import { useWorkspaceFiles } from "../hooks/useWorkspaceFiles";
import { WorkspaceFileMentionPanel } from "./WorkspaceFileMentionPanel";

type ComposerWorkspaceMentionsProps = {
    className?: string;
    placeholder?: string;
    rows?: number;
};

export const ComposerWorkspaceMentions: FC<ComposerWorkspaceMentionsProps> = ({
    className,
    placeholder,
    rows = 1,
}) => {
    const aui = useAui();
    const composerText = useAuiState((s) => (s.composer.isEditing ? s.composer.text : ""));
    const { files, loading, error } = useWorkspaceFiles();
    const [caretPos, setCaretPos] = useState(0);
    const [activeIndex, setActiveIndex] = useState(0);
    const [dismissedToken, setDismissedToken] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const mentionListRef = useRef<HTMLDivElement>(null);
    const fileMatchRef = useRef<Extract<WorkspaceMentionMatch, { type: "file" }> | null>(null);

    const updateCaret = useCallback(() => {
        const el = textareaRef.current;
        if (!el) return;
        setCaretPos(el.selectionStart ?? 0);
    }, []);

    const activeMatch = useMemo(
        () => getActiveWorkspaceMention(composerText, caretPos, caretPos),
        [composerText, caretPos],
    );

    useEffect(() => {
        if (activeMatch?.type === "file") {
            fileMatchRef.current = activeMatch;
        } else {
            fileMatchRef.current = null;
        }
    }, [activeMatch]);

    useEffect(() => {
        if (!activeMatch || activeMatch.type !== "file") {
            setDismissedToken(null);
            return;
        }
        if (dismissedToken !== null && activeMatch.token !== dismissedToken) {
            setDismissedToken(null);
        }
    }, [activeMatch, dismissedToken]);

    const rankedFiles = useMemo(() => {
        if (!activeMatch || activeMatch.type !== "file") return [];
        return rankWorkspaceFiles(files, activeMatch.query);
    }, [activeMatch, files]);

    const showPanel =
        Boolean(activeMatch?.type === "file" && activeMatch.token !== dismissedToken);

    useEffect(() => {
        setActiveIndex(0);
    }, [activeMatch?.query, activeMatch?.start]);

    useLayoutEffect(() => {
        if (!showPanel || rankedFiles.length === 0) return;
        const activeEl = mentionListRef.current?.querySelector<HTMLElement>(".aui-composer-file-mention-item.is-active");
        activeEl?.scrollIntoView({ block: "nearest" });
    }, [activeIndex, showPanel, rankedFiles.length]);

    useEffect(() => {
        setActiveIndex((i) => {
            if (rankedFiles.length === 0) return 0;
            return Math.min(i, rankedFiles.length - 1);
        });
    }, [rankedFiles.length]);

    const insertFile = useCallback(
        (file: WorkspaceFile) => {
            let match: WorkspaceMentionMatch | null =
                fileMatchRef.current ?? getActiveWorkspaceMention(composerText, caretPos, caretPos);
            if (!match || match.type !== "file") return;
            if (composerText.slice(match.start, match.end) !== match.token) return;
            const insert = formatInsertedWorkspaceReference(file.relativePath);
            const before = composerText.slice(0, match.start);
            const after = composerText.slice(match.end);
            const next = before + insert + after;
            aui.composer().setText(next);
            setDismissedToken(null);
            const pos = before.length + insert.length;
            requestAnimationFrame(() => {
                const ta = textareaRef.current;
                if (ta) {
                    ta.focus();
                    ta.setSelectionRange(pos, pos);
                    setCaretPos(pos);
                }
            });
        },
        [aui, composerText, caretPos],
    );

    const handleKeyDown = useCallback(
        (e: KeyboardEvent<HTMLTextAreaElement>) => {
            if (!showPanel || !activeMatch || activeMatch.type !== "file") return;

            if (e.key === "Escape") {
                e.preventDefault();
                setDismissedToken(activeMatch.token);
                return;
            }

            if (rankedFiles.length === 0) return;

            if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => (i + 1) % rankedFiles.length);
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => (i - 1 + rankedFiles.length) % rankedFiles.length);
                return;
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                const file = rankedFiles[activeIndex];
                if (file) insertFile(file);
            }
        },
        [showPanel, activeMatch, rankedFiles, activeIndex, insertFile],
    );

    const handleSelect = useCallback(
        (file: WorkspaceFile) => {
            insertFile(file);
        },
        [insertFile],
    );

    return (
        <>
            <ComposerPrimitive.Input
                ref={textareaRef}
                className={className}
                placeholder={placeholder}
                rows={rows}
                onKeyDown={handleKeyDown}
                onSelect={updateCaret}
                onClick={updateCaret}
                onKeyUp={updateCaret}
            />
            {showPanel && (
                <WorkspaceFileMentionPanel
                    files={rankedFiles}
                    activeIndex={activeIndex}
                    loading={loading}
                    error={error}
                    onSelect={handleSelect}
                    listRef={mentionListRef}
                />
            )}
        </>
    );
};
