export type SkillSource = 'official' | 'community' | 'custom';

export interface Skill {
    id: string;
    name: string;
    command: string;
    description: string;
    source: SkillSource;
    isEnabled: boolean;
    isVerified: boolean;
    isHidden: boolean;
    filePath: string;
    githubUrl?: string;
    updatedAt: string;
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
