import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import type { Skill, SkillSource, SkillFrontmatter } from '../types/skills';

// Desktop Agent Paths
const OPENWORK_SKILLS_PATH = 'c:\\Users\\roube\\Desktop\\desktop agent\\openwork\\apps\\desktop\\bundled-skills';
const FINANCIAL_SKILLS_PATH = 'c:\\Users\\roube\\Desktop\\desktop agent\\skills\\financial-services-plugins';

export class SkillsManager {
    async getAll(): Promise<Skill[]> {
        const openworkSkills = this.scanDirectory(OPENWORK_SKILLS_PATH, 'official');
        const financialSkills = this.scanDirectory(FINANCIAL_SKILLS_PATH, 'custom');

        return [...openworkSkills, ...financialSkills];
    }

    private scanDirectory(dirPath: string, defaultSource: SkillSource): Skill[] {
        const skills: Skill[] = [];

        if (!fs.existsSync(dirPath)) {
            console.warn(`[SkillsManager] Directory not found: ${dirPath}`);
            return skills;
        }

        // Recursively walk the entire tree collecting SKILL.md and commands
        this.walkForSkillMd(dirPath, skills, defaultSource);
        this.walkForCommands(dirPath, skills, defaultSource);

        return skills;
    }

    /**
     * Recursively walk `dirPath`. Whenever a directory contains `SKILL.md`,
     * parse it as a skill. Continue descending regardless.
     */
    private walkForSkillMd(dirPath: string, skills: Skill[], defaultSource: SkillSource): void {
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dirPath, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const fullPath = path.join(dirPath, entry.name);
            const skillMdPath = path.join(fullPath, 'SKILL.md');

            if (fs.existsSync(skillMdPath)) {
                this.parseAndPushSkill(skillMdPath, defaultSource, skills);
            }

            // Always recurse deeper (skills can be nested at any depth)
            this.walkForSkillMd(fullPath, skills, defaultSource);
        }
    }

    /**
     * Recursively walk `dirPath` looking for `commands/` directories.
     * For each `.md` file inside, create a "command" skill entry.
     */
    private walkForCommands(dirPath: string, skills: Skill[], defaultSource: SkillSource): void {
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dirPath, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const fullPath = path.join(dirPath, entry.name);

            if (entry.name === 'commands') {
                this.scanCommandsDir(fullPath, defaultSource, skills);
            } else {
                // Recurse into other subdirs to find nested commands/ folders
                this.walkForCommands(fullPath, skills, defaultSource);
            }
        }
    }

    /**
     * Scan a `commands/` directory and turn each `.md` file into a Skill entry.
     */
    private scanCommandsDir(commandsDir: string, defaultSource: SkillSource, skills: Skill[]): void {
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(commandsDir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

            const filePath = path.join(commandsDir, entry.name);

            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const { data } = matter(content);

                const stem = path.basename(entry.name, '.md');
                const name = (data.name as string | undefined) || stem;
                const description = (data.description as string | undefined) || '';
                const argumentHint = (data['argument-hint'] as string | undefined) || '';
                const fullDescription = argumentHint
                    ? `${description} Usage: ${argumentHint}`.trim()
                    : description;

                const source = defaultSource;
                const id = `cmd-${this.sanitizeSkillName(name)}-${source}`;
                const command = (data.command as string | undefined) || `/${this.sanitizeSkillName(stem)}`;

                // Avoid duplicate commands (SKILL.md and command .md for same feature)
                if (skills.some((s) => s.id === id)) continue;

                skills.push({
                    id,
                    name,
                    command,
                    description: fullDescription,
                    source,
                    isEnabled: true,
                    isVerified: false,
                    isHidden: false,
                    filePath,
                    updatedAt: new Date().toISOString(),
                });
            } catch (err) {
                console.error(`[SkillsManager] Failed to parse command ${filePath}:`, err);
            }
        }
    }

    private parseAndPushSkill(skillMdPath: string, defaultSource: SkillSource, skills: Skill[]): void {
        try {
            const content = fs.readFileSync(skillMdPath, 'utf-8');
            const frontmatter = this.parseFrontmatter(content);

            // Derive folder name from path as fallback
            const folderName = path.basename(path.dirname(skillMdPath));
            const name = frontmatter.name || folderName;
            const source = defaultSource;
            const id = this.generateId(name, source);
            const safeName = this.sanitizeSkillName(name);

            // Avoid adding duplicates
            if (skills.some((s) => s.id === id)) return;

            skills.push({
                id,
                name,
                command: frontmatter.command || `/${safeName}`,
                description: frontmatter.description || '',
                source,
                isEnabled: true,
                isVerified: frontmatter.verified || false,
                isHidden: frontmatter.hidden || false,
                filePath: skillMdPath,
                updatedAt: new Date().toISOString(),
            });
        } catch (err) {
            console.error(`[SkillsManager] Failed to parse ${skillMdPath}:`, err);
        }
    }

    private parseFrontmatter(content: string): SkillFrontmatter {
        try {
            const { data } = matter(content);
            return {
                name: data.name || '',
                description: data.description || '',
                command: data.command,
                verified: data.verified,
                hidden: data.hidden,
            };
        } catch {
            return { name: '', description: '' };
        }
    }

    private generateId(name: string, source: SkillSource): string {
        const safeName = this.sanitizeSkillName(name);
        return `${source}-${safeName}`;
    }

    private sanitizeSkillName(name: string): string {
        return name
            .replace(/\.\./g, '')
            .replace(/[/\\]/g, '-')
            .replace(/[^a-zA-Z0-9-_\s]/g, '-')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .toLowerCase()
            .trim();
    }
}

export const skillsManager = new SkillsManager();
