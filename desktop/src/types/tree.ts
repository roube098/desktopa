/** Shared folder/file tree for skill and plugin file outlines in Settings. */
export type FileTreeNodeType = 'folder' | 'file';

export interface FileTreeNode {
  name: string;
  path: string;
  relativePath: string;
  type: FileTreeNodeType;
  children: FileTreeNode[];
}
