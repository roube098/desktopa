export type DesktopPluginSource = 'builtin' | 'user' | 'project' | 'external';
export type DesktopPluginBadgeSource = 'official' | 'custom';

export interface DesktopPlugin {
  id: string;
  name: string;
  description: string;
  source: DesktopPluginSource;
  desktopSource: DesktopPluginBadgeSource;
  path: string;
  manifestPath: string;
  filePath: string;
  isLegacy: boolean;
  isEnabled: boolean;
  scopes: string[];
  loadError?: string;
  updatedAt: string;
  components: {
    skills: string[];
    tools: string[];
    hooks: string[];
    commands: string[];
    agents: string[];
  };
}

export type PluginTreeNodeType = 'folder' | 'file';

export interface PluginTreeNode {
  name: string;
  path: string;
  relativePath: string;
  type: PluginTreeNodeType;
  children: PluginTreeNode[];
}

export interface PluginFileContent {
  path: string;
  content: string;
  updatedAt: string;
}
