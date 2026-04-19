const fs = require("fs");
const os = require("os");
const path = require("path");
const matter = require("gray-matter");
const runtimeConfigStore = require("./runtime-config-store");
const { pluginManager } = require("./plugin-manager");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

function getBaseSkillSources() {
  return [
    {
      path: path.join(REPO_ROOT, "skills"),
      source: "custom",
      pluginName: "",
      pluginEnabled: true,
    },
    {
      path: path.join(REPO_ROOT, "dexter", "src", "skills"),
      source: "official",
      pluginName: "",
      pluginEnabled: true,
    },
    {
      path: path.join(os.homedir(), ".excelor", "skills"),
      source: "custom",
      pluginName: "",
      pluginEnabled: true,
    },
    {
      path: path.join(REPO_ROOT, ".excelor", "skills"),
      source: "custom",
      pluginName: "",
      pluginEnabled: true,
    },
  ];
}

function getPluginSkillSources() {
  return pluginManager.getCatalog()
    .filter((plugin) => !plugin.loadError)
    .flatMap((plugin) => [
      ...plugin.components.skills.map((componentPath) => ({
        path: componentPath,
        source: plugin.desktopSource,
        pluginName: plugin.name,
        pluginEnabled: plugin.isEnabled,
      })),
      ...plugin.components.commands.map((componentPath) => ({
        path: componentPath,
        source: plugin.desktopSource,
        pluginName: plugin.name,
        pluginEnabled: plugin.isEnabled,
      })),
    ]);
}

function getSkillSources() {
  return [...getBaseSkillSources(), ...getPluginSkillSources()];
}

class SkillsManager {
  getCatalog() {
    const config = runtimeConfigStore.getConfig();
    const skills = [];
    const commands = [];
    const seen = new Set();

    for (const sourceEntry of getSkillSources()) {
      this.scanTree(
        sourceEntry.path,
        sourceEntry.source,
        skills,
        commands,
        seen,
        config,
        sourceEntry.pluginEnabled,
        sourceEntry.pluginName,
      );
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
    const catalog = this.getCatalog();
    const skill = catalog.skills.find((entry) => entry.id === skillId);
    runtimeConfigStore.setSkillEnabled(skillId, enabled, skill?.filePath);
    return this.getSkillRuntimeConfig();
  }

  setCommandState(commandId, patch) {
    runtimeConfigStore.setCommandState(commandId, patch);
    return this.getCommandRuntimeConfig();
  }

  listSkillsForIpc(payload = {}) {
    const cwds = Array.isArray(payload.cwds) ? payload.cwds : [];
    const cwd0 = cwds.length > 0 ? path.resolve(String(cwds[0])) : process.cwd();
    const { skills } = this.getCatalog();
    return {
      version: 2,
      entries: [
        {
          cwd: cwd0,
          skills: skills.map((s) => ({
            name: s.name,
            description: s.description,
            path: s.filePath,
            enabled: s.isEnabled !== false,
          })),
          errors: [],
        },
      ],
    };
  }

  getSkillTree(skillId) {
    const skills = this.getAll();
    const skill = skills.find((entry) => entry.id === skillId);
    if (!skill) {
      return null;
    }

    const skillRoot = path.dirname(skill.filePath);
    return this.buildSkillTreeNode(skillRoot, skillRoot);
  }

  readSkillFile(filePath) {
    if (!filePath || typeof filePath !== "string") {
      throw new Error("A file path is required.");
    }

    const targetPath = path.resolve(filePath);
    const allowedRoots = this.getAll().map((skill) => path.dirname(skill.filePath));
    const isAllowed = allowedRoots.some((rootPath) => this.isPathInside(rootPath, targetPath));
    if (!isAllowed) {
      throw new Error("File path is outside of known skill directories.");
    }

    const stat = fs.statSync(targetPath);
    if (!stat.isFile()) {
      throw new Error("Path is not a file.");
    }

    return {
      path: targetPath,
      content: fs.readFileSync(targetPath, "utf-8"),
      updatedAt: stat.mtime.toISOString(),
    };
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

  scanTree(rootPath, source, skills, commands, seen, config, pluginEnabled = true, pluginName = "") {
    if (!fs.existsSync(rootPath)) {
      return;
    }

    try {
      if (fs.statSync(rootPath).isFile()) {
        const fileName = path.basename(rootPath);
        if (fileName === "SKILL.md") {
          const skill = this.parseSkill(rootPath, source, config, pluginEnabled, pluginName);
          if (skill && !seen.has(skill.id)) {
            seen.add(skill.id);
            skills.push(skill);
          }
        } else if (fileName.endsWith(".md")) {
          const command = this.parseCommand(rootPath, source, config, pluginEnabled, pluginName);
          if (command && !seen.has(command.id)) {
            seen.add(command.id);
            commands.push(command);
          }
        }
        return;
      }
    } catch {
      return;
    }

    this.walk(rootPath, (entryPath, dirent) => {
      if (dirent.isFile() && dirent.name === "SKILL.md") {
        const skill = this.parseSkill(entryPath, source, config, pluginEnabled, pluginName);
        if (skill && !seen.has(skill.id)) {
          seen.add(skill.id);
          skills.push(skill);
        }
      }

      if (dirent.isFile() && entryPath.includes(`${path.sep}commands${path.sep}`) && dirent.name.endsWith(".md")) {
        const command = this.parseCommand(entryPath, source, config, pluginEnabled, pluginName);
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

  buildSkillTreeNode(currentPath, rootPath) {
    const stat = fs.statSync(currentPath);
    const relativePath = path.relative(rootPath, currentPath);
    const node = {
      name: path.basename(currentPath),
      path: currentPath,
      relativePath: relativePath ? relativePath.split(path.sep).join("/") : "",
      type: stat.isDirectory() ? "folder" : "file",
      children: [],
    };

    if (!stat.isDirectory()) {
      return node;
    }

    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    const sorted = entries
      .filter((entry) => !entry.name.startsWith("."))
      .sort((left, right) => {
        if (left.isDirectory() !== right.isDirectory()) {
          return left.isDirectory() ? -1 : 1;
        }
        return left.name.localeCompare(right.name, undefined, { sensitivity: "base", numeric: true });
      });

    node.children = sorted.map((entry) => this.buildSkillTreeNode(path.join(currentPath, entry.name), rootPath));
    return node;
  }

  isPathInside(parentDir, targetPath) {
    const parent = path.resolve(parentDir);
    const target = path.resolve(targetPath);
    const parentWithSep = parent.endsWith(path.sep) ? parent : `${parent}${path.sep}`;
    return target === parent || target.startsWith(parentWithSep);
  }

  parseSkill(filePath, source, config, pluginEnabled = true, pluginName = "") {
    try {
      const file = fs.readFileSync(filePath, "utf-8");
      const { data, content } = matter(file);
      const folderName = path.basename(path.dirname(filePath));
      const name = data.name || folderName;
      const pluginPrefix = pluginName ? `${this.slugify(pluginName)}-` : "";
      const id = `${source}-skill-${pluginPrefix}${this.slugify(name)}`;
      const state = config.skills.entries[id] || {};
      const stat = fs.statSync(filePath);

      return {
        id,
        name,
        command: data.command || `/${this.slugify(name)}`,
        alias: data.command || `/${this.slugify(name)}`,
        description: data.description || this.extractDescription(content),
        source,
        isEnabled: pluginEnabled && state.enabled !== false,
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

  parseCommand(filePath, source, config, pluginEnabled = true, pluginName = "") {
    try {
      const file = fs.readFileSync(filePath, "utf-8");
      const { data, content } = matter(file);
      const stem = path.basename(filePath, ".md");
      const name = data.name || stem;
      const defaultAlias = data.command || `/${this.slugify(stem)}`;
      const pluginPrefix = pluginName ? `${this.slugify(pluginName)}-` : "";
      const id = `${source}-command-${pluginPrefix}${this.slugify(path.relative(path.dirname(filePath), filePath))}-${this.slugify(name)}`;
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
        isEnabled: pluginEnabled && state.enabled !== false,
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
  getSkillSources,
};
