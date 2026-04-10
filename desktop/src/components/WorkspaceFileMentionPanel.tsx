import type { FC, RefObject } from "react";

export interface WorkspaceFileMentionPanelProps {
    files: WorkspaceFile[];
    activeIndex: number;
    loading: boolean;
    error: string;
    onSelect: (file: WorkspaceFile) => void;
    listRef?: RefObject<HTMLDivElement | null>;
}

export const WorkspaceFileMentionPanel: FC<WorkspaceFileMentionPanelProps> = ({
    files,
    activeIndex,
    loading,
    error,
    onSelect,
    listRef,
}) => {
    return (
        <div className="aui-composer-file-mention-panel" role="listbox" aria-label="Workspace files">
            <div className="aui-composer-file-mention-header">
                <span className="aui-composer-file-mention-title">Workspace files</span>
                <span className="aui-composer-file-mention-hint">↑↓ Enter · Esc</span>
            </div>
            <div className="aui-composer-file-mention-list" ref={listRef}>
                {loading && (
                    <div className="aui-composer-file-mention-empty" role="status">
                        Loading files…
                    </div>
                )}
                {!loading && error && (
                    <div className="aui-composer-file-mention-empty aui-composer-file-mention-error" role="alert">
                        {error}
                    </div>
                )}
                {!loading && !error && files.length === 0 && (
                    <div className="aui-composer-file-mention-empty">No files in workspace</div>
                )}
                {!loading &&
                    !error &&
                    files.map((file, index) => (
                        <button
                            key={file.path}
                            type="button"
                            role="option"
                            aria-selected={index === activeIndex}
                            className={`aui-composer-file-mention-item${index === activeIndex ? " is-active" : ""}`}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                onSelect(file);
                            }}
                        >
                            <span className="aui-composer-file-mention-name">{file.name}</span>
                            <span className="aui-composer-file-mention-meta">{file.relativePath}</span>
                        </button>
                    ))}
            </div>
        </div>
    );
};
