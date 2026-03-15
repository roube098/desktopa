const fs = require("fs");
const os = require("os");
const path = require("path");
const matter = require("gray-matter");
const runtimeConfigStore = require("./runtime-config-store");

const SKILL_SOURCES = [
  {
    path: path.join(os.homedir(), ".codex", "skills"),
    source: "official",
  },
  {
    path: "c:\\Users\\roube\\Desktop\\desktop agent\\openwork\\apps\\desktop\\bundled-skills",
    source: "official",
  },
  {
    path: "c:\\Users\\roube\\Desktop\\desktop agent\\skills\\financial-services-plugins",
    source: "custom",
  },
];

class SkillsManager {
  getCatalog() {
    const config = runtimeConfigStore.getConfig();
    const skills = [];
    const commands = [];
    const seen = new Set();

    for (const sourceEntry of SKILL_SOURCES) {
      this.scanTree(sourceEntry.path, sourceEntry.source, skills, commands, seen, config);
    }

    skills.sort((left, right) => left.name.localeCompare(right.name));
    commands.sort((left, right) => left.alias.localeCompare(right.alias));

    return { skills, commands };
  }

  getAll() {
    return this.getCatalog().skills;
  }

  getSkillRuntimeConfig() {
    return this.getCatalog().skills;
  }

  getCommandRuntimeConfig() {
    return this.getCatalog().commands;
  }

  setSkillEnabled(skillId, enabled) {
    runtimeConfigStore.setSkillEnabled(skillId, enabled);
    return this.getSkillRuntimeConfig();
  }

  setCommandState(commandId, patch) {
    runtimeConfigStore.setCommandState(commandId, patch);
    return this.getCommandRuntimeConfig();
  }

  loadEnabledPromptBlocks() {
    const { skills, commands } = this.getCatalog();

    return {
      skills: skills
        .filter((skill) => skill.isEnabled && !skill.isHidden)
        .map((skill) => ({
          id: skill.id,
          name: skill.name,
          filePath: skill.filePath,
          content: this.readFileSnippet(skill.filePath),
        }))
        .filter((skill) => skill.content),
      commands: commands
        .filter((command) => command.isEnabled)
        .map((command) => ({
          id: command.id,
          name: command.name,
          alias: command.alias,
          filePath: command.filePath,
          content: this.readFileSnippet(command.filePath),
        }))
        .filter((command) => command.content),
    };
  }

  scanTree(rootPath, source, skills, commands, seen, config) {
    if (!fs.existsSync(rootPath)) {
      return;
    }

    this.walk(rootPath, (entryPath, dirent) => {
      if (dirent.isFile() && dirent.name === "SKILL.md") {
        const skill = this.parseSkill(entryPath, source, config);
        if (skill && !seen.has(skill.id)) {
          seen.add(skill.id);
          skills.push(skill);
        }
      }

      if (dirent.isFile() && entryPath.includes(`${path.sep}commands${path.sep}`) && dirent.name.endsWith(".md")) {
        const command = this.parseCommand(entryPath, source, config);
        if (command && !seen.has(command.id)) {
          seen.add(command.id);
          commands.push(command);
        }
      }
    });
  }

  walk(currentPath, visitor) {
    let entries = [];

    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const nextPath = path.join(currentPath, entry.name);
      visitor(nextPath, entry);
      if (entry.isDirectory()) {
        this.walk(nextPath, visitor);
      }
    }
  }

  parseSkill(filePath, source, config) {
    try {
      const file = fs.readFileSync(filePath, "utf-8");
      const { data, content } = matter(file);
      const folderName = path.basename(path.dirname(filePath));
      const name = data.name || folderName;
      const id = `${source}-skill-${this.slugify(name)}`;
      const state = config.skills.entries[id] || {};
      const stat = fs.statSync(filePath);

      return {
        id,
        name,
        command: data.command || `/${this.slugify(name)}`,
        alias: data.command || `/${this.slugify(name)}`,
        description: data.description || this.extractDescription(content),
        source,
        isEnabled: state.enabled !== false,
        isVerified: Boolean(data.verified),
        isHidden: Boolean(data.hidden),
        filePath,
        updatedAt: stat.mtime.toISOString(),
        entryType: "skill",
      };
    } catch (error) {
      console.error("[skills-manager] Failed to parse skill:", filePath, error);
      return null;
    }
  }

  parseCommand(filePath, source, config) {
    try {
      const file = fs.readFileSync(filePath, "utf-8");
      const { data, content } = matter(file);
      const stem = path.basename(filePath, ".md");
      const name = data.name || stem;
      const defaultAlias = data.command || `/${this.slugify(stem)}`;
      const id = `${source}-command-${this.slugify(path.relative(path.dirname(filePath), filePath))}-${this.slugify(name)}`;
      const state = config.commands.entries[id] || {};
      const stat = fs.statSync(filePath);
      const description = data.description || this.extractDescription(content);
      const argumentHint = data["argument-hint"] ? ` Usage: ${data["argument-hint"]}` : "";

      return {
        id,
        name,
        alias: state.alias || defaultAlias,
        command: defaultAlias,
        description: `${description}${argumentHint}`.trim(),
        source,
        isEnabled: state.enabled !== false,
        isVerified: Boolean(data.verified),
        isHidden: Boolean(data.hidden),
        filePath,
        updatedAt: stat.mtime.toISOString(),
        entryType: "command",
      };
    } catch (error) {
      console.error("[skills-manager] Failed to parse command:", filePath, error);
      return null;
    }
  }

  readFileSnippet(filePath) {
    try {
      return fs.readFileSync(filePath, "utf-8").slice(0, 6000);
    } catch {
      return "";
    }
  }

  extractDescription(content) {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return lines[0] || "";
  }

  slugify(value) {
    return String(value)
      .replace(/\.\./g, "")
      .replace(/[\\/]/g, "-")
      .replace(/[^a-zA-Z0-9-_\s]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
  }
}

const skillsManager = new SkillsManager();

module.exports = {
  SkillsManager,
  skillsManager,
  SKILL_SOURCES,
};
