export type SkillSource = 'official' | 'community' | 'custom';

/** Canonical scope aligned with codex / dexter (legacy SkillSource kept for UI chips). */
export type SkillScope = 'user' | 'repo' | 'system' | 'admin';

export interface SkillInterface {
    displayName?: string;
    shortDescription?: string;
    iconSmall?: string;
    iconLarge?: string;
    brandColor?: string;
    defaultPrompt?: string;
}

export interface SkillToolDependency {
    type: string;
    value: string;
    description?: string;
    transport?: string;
    command?: string;
    url?: string;
}

export interface SkillDependencies {
    tools: SkillToolDependency[];
}

export interface SkillPolicy {
    allowImplicitInvocation?: boolean;
    products?: string[];
}

export interface Skill {
    id: string;
    name: string;
    command: string;
    description: string;
    source: SkillSource;
    /** Codex-style scope when synced from dexter / IPC */
    scope?: SkillScope;
    shortDescription?: string;
    interface?: SkillInterface;
    dependencies?: SkillDependencies;
    policy?: SkillPolicy;
    isEnabled: boolean;
    isVerified: boolean;
    isHidden: boolean;
    filePath: string;
    githubUrl?: string;
    updatedAt: string;
    pluginName?: string;
}

export type SkillTreeNodeType = 'folder' | 'file';

export interface SkillTreeNode {
    name: string;
    path: string;
    relativePath: string;
    type: SkillTreeNodeType;
    children: SkillTreeNode[];
}

export interface SkillFileContent {
    path: string;
    content: string;
    updatedAt: string;
}

export interface SkillFrontmatter {
    name: string;
    description: string;
    command?: string;
    verified?: boolean;
    hidden?: boolean;
}

/** Pending skill create/update proposed by Dexter self-improvement (desktop thread). */
export interface SkillProposalEntry {
    id: string;
    proposalId: string;
    action: 'create' | 'update';
    name: string;
    description: string;
    body: string;
    skillNameToUpdate?: string;
    createdAt: string;
    status?: 'pending' | 'accepted' | 'rejected';
}
