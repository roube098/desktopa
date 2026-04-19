import type { FileTreeNode } from '../../types/tree';

interface FileTreeOutlineProps {
  nodes: FileTreeNode[];
  depth?: number;
  expandedFolders: ReadonlySet<string>;
  onToggleFolder: (folderPath: string) => void;
  selectedFilePath: string | null;
  onSelectFile: (path: string) => void;
}

export function FileTreeOutline({
  nodes,
  depth = 0,
  expandedFolders,
  onToggleFolder,
  selectedFilePath,
  onSelectFile,
}: FileTreeOutlineProps) {
  function renderNode(node: FileTreeNode, d: number) {
    const isFolder = node.type === 'folder';
    const isExpanded = isFolder && expandedFolders.has(node.path);
    const isSelectedFile = !isFolder && selectedFilePath === node.path;
    const hasChildren = isFolder && node.children.length > 0;
    const indent = 18 + d * 14;

    return (
      <div key={node.path}>
        <button
          type="button"
          onClick={() => {
            if (isFolder) {
              onToggleFolder(node.path);
              return;
            }
            onSelectFile(node.path);
          }}
          className={`settings-resource-tree-btn px-2.5 py-[5px] text-left ${isSelectedFile ? 'settings-resource-tree-btn--selected' : ''}`}
          style={{
            paddingLeft: `${indent}px`,
            color: isSelectedFile ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          {isFolder ? (
            <>
              <svg
                className={`w-3 h-3 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <svg
                className="w-[13px] h-[13px] shrink-0 opacity-50"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </>
          ) : (
            <>
              <span className="w-3 shrink-0" />
              <svg
                className="w-[13px] h-[13px] shrink-0 opacity-50"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </>
          )}
          <span className="truncate text-[12.5px]">{node.name}</span>
          {isFolder && hasChildren && (
            <span className="ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {node.children.length}
            </span>
          )}
        </button>

        {isFolder && isExpanded && hasChildren && (
          <div>{node.children.map((child) => renderNode(child, d + 1))}</div>
        )}
      </div>
    );
  }

  return <>{nodes.map((node) => renderNode(node, depth))}</>;
}
