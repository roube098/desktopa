const fs = require("fs");
const os = require("os");
const path = require("path");
const runtimeConfigStore = require("./runtime-config-store");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PLUGIN_MANIFEST_PATH = path.join(".excelor-plugin", "plugin.json");
const SOURCE_PRECEDENCE = ["builtin", "user", "project", "external"];

function slugify(value) {
  return String(value || "")
    .replace(/\.\./g, "")
    .replace(/[\\/]/g, "-")
    .replace(/[^a-zA-Z0-9-_\s]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function normalizePathList(value) {
  if (!value) {
    return [];
  }
  const items = Array.isArray(value) ? value : [value];
  return items
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .map((entry) => path.resolve(entry));
}

function getDefaultWorkspaceDir() {
  const config = runtimeConfigStore.getConfig();
  return config?.runtime?.defaultWorkingDirectory || runtimeConfigStore.DEFAULT_WORKSPACE_DIR;
}

function getExternalPaths() {
  const config = runtimeConfigStore.getConfig();
  const entries = Array.isArray(config?.plugins?.externalPaths) ? config.plugins.externalPaths : [];
  return entries
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .map((entry) => path.resolve(entry));
}

function getSourceRoots() {
  const builtinRoots = [
    path.join(REPO_ROOT, "plugins"),
    path.join(REPO_ROOT, "Plugins"),
  ];
  const uniqueBuiltinRoots = Array.from(new Set(builtinRoots.map((rootPath) => path.resolve(rootPath))));

  return [
    ...uniqueBuiltinRoots.map((rootPath) => ({ source: "builtin", rootPath })),
    { source: "user", rootPath: path.join(os.homedir(), ".excelor", "plugins") },
    { source: "project", rootPath: path.join(getDefaultWorkspaceDir(), ".excelor", "plugins") },
    ...getExternalPaths().map((rootPath) => ({ source: "external", rootPath })),
  ];
}

function pathExists(targetPath) {
  try {
    return fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

function isDirectory(targetPath) {
  try {
    return fs.statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

function looksLikePluginRoot(rootPath) {
  return [
    path.join(rootPath, PLUGIN_MANIFEST_PATH),
    path.join(rootPath, "skills"),
    path.join(rootPath, "tools"),
    path.join(rootPath, "hooks"),
    path.join(rootPath, "commands"),
    path.join(rootPath, "agents"),
  ].some((candidate) => pathExists(candidate));
}

function listChildDirectories(rootPath) {
  try {
    return fs.readdirSync(rootPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(rootPath, entry.name));
  } catch {
    return [];
  }
}

function listCandidatePluginRoots(rootPath) {
  if (!pathExists(rootPath)) {
    return [];
  }

  if (looksLikePluginRoot(rootPath)) {
    return [rootPath];
  }

  return listChildDirectories(rootPath).filter((childPath) => looksLikePluginRoot(childPath));
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (error) {
    return { __error: error instanceof Error ? error.message : String(error) };
  }
}

function isValidManifest(manifest) {
  return manifest
    && typeof manifest === "object"
    && typeof manifest.name === "string"
    && manifest.name.trim()
    && !manifest.name.includes(" ");
}

function resolveComponentPaths(pluginRoot, value) {
  const paths = [];
  const rawEntries = Array.isArray(value) ? value : (value ? [value] : []);
  for (const entry of rawEntries) {
    const relativePath = String(entry || "").trim();
    if (!relativePath) continue;
    const absolutePath = path.resolve(pluginRoot, relativePath);
    if (pathExists(absolutePath)) {
      paths.push(absolutePath);
    }
  }
  return Array.from(new Set(paths));
}

function resolveHookPaths(pluginRoot, hooksValue) {
  if (!hooksValue) {
    return [];
  }
  if (typeof hooksValue === "string" || Array.isArray(hooksValue)) {
    return resolveComponentPaths(pluginRoot, hooksValue);
  }
  if (typeof hooksValue === "object") {
    return Array.from(
      new Set(
        Object.values(hooksValue).flatMap((entry) => resolveComponentPaths(pluginRoot, entry)),
      ),
    );
  }
  return [];
}

function listAgentsPaths(pluginRoot) {
  const agentsDir = path.join(pluginRoot, "agents");
  if (!isDirectory(agentsDir)) {
    return [];
  }
  return listChildDirectories(agentsDir).length > 0
    ? listChildDirectories(agentsDir)
    : fs.readdirSync(agentsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(agentsDir, entry.name));
}

function getPluginEnabledState(pluginName) {
  const config = runtimeConfigStore.getConfig();
  const pluginsConfig = config?.plugins || {};
  if (pluginsConfig.enabled === false) {
    return false;
  }
  const entry = pluginsConfig.entries?.[pluginName];
  if (entry && entry.enabled === false) {
    return false;
  }
  return true;
}

function toDesktopSource(pluginSource) {
  if (pluginSource === "builtin") {
    return "official";
  }
  return "custom";
}

function readLegacyDescription(pluginRoot) {
  const readmePath = path.join(pluginRoot, "README.md");
  if (!pathExists(readmePath)) {
    return "";
  }
  try {
    const lines = fs.readFileSync(readmePath, "utf-8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith("#"));
    return lines[0] || "";
  } catch {
    return "";
  }
}

function getPrimaryPluginFilePath(pluginRoot, manifestPath, hasManifest) {
  if (hasManifest && manifestPath) {
    return manifestPath;
  }

  const readmePath = path.join(pluginRoot, "README.md");
  if (pathExists(readmePath)) {
    return readmePath;
  }

  return pluginRoot;
}

function isLikelyTextFile(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const allowed = new Set([
    ".md",
    ".txt",
    ".json",
    ".js",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".jsx",
    ".yml",
    ".yaml",
    ".toml",
    ".ini",
    ".cfg",
    ".env",
    ".csv",
    ".xml",
    ".html",
    ".css",
    ".sh",
    ".ps1",
    ".bat",
  ]);
  return allowed.has(ext);
}

function buildCatalogEntry(pluginRoot, source) {
  const manifestPath = path.join(pluginRoot, PLUGIN_MANIFEST_PATH);
  const hasManifest = pathExists(manifestPath);
  const fallbackName = path.basename(pluginRoot);

  let manifest = null;
  let loadError = "";
  let isLegacy = false;

  if (hasManifest) {
    const parsed = safeReadJson(manifestPath);
    if (parsed && parsed.__error) {
      loadError = `Manifest parse error: ${parsed.__error}`;
    } else if (!isValidManifest(parsed)) {
      loadError = "Manifest validation error: plugin.json must contain a kebab-case name.";
    } else {
      manifest = parsed;
    }
  } else {
    isLegacy = true;
    manifest = {
      name: fallbackName,
      description: readLegacyDescription(pluginRoot),
      scopes: ["all"],
    };
  }

  const name = manifest?.name || fallbackName;
  const skillsPaths = [
    ...(isDirectory(path.join(pluginRoot, "skills")) ? [path.join(pluginRoot, "skills")] : []),
    ...resolveComponentPaths(pluginRoot, manifest?.skills),
  ];
  const toolsPaths = [
    ...(pathExists(path.join(pluginRoot, "tools", "index.ts")) ? [path.join(pluginRoot, "tools", "index.ts")] : []),
    ...(pathExists(path.join(pluginRoot, "tools", "index.js")) ? [path.join(pluginRoot, "tools", "index.js")] : []),
    ...resolveComponentPaths(pluginRoot, manifest?.tools),
  ];
  const commandsPaths = [
    ...(isDirectory(path.join(pluginRoot, "commands")) ? [path.join(pluginRoot, "commands")] : []),
    ...resolveComponentPaths(pluginRoot, manifest?.commands),
  ];
  const hooksPaths = [
    ...(pathExists(path.join(pluginRoot, "hooks", "index.ts")) ? [path.join(pluginRoot, "hooks", "index.ts")] : []),
    ...(pathExists(path.join(pluginRoot, "hooks", "index.js")) ? [path.join(pluginRoot, "hooks", "index.js")] : []),
    ...resolveHookPaths(pluginRoot, manifest?.hooks),
  ];
  const agentsPaths = listAgentsPaths(pluginRoot);
  const scopes = Array.isArray(manifest?.scopes) && manifest.scopes.length > 0 ? manifest.scopes : ["all"];

  return {
    id: `plugin-${slugify(name)}`,
    name,
    description: manifest?.description || loadError || readLegacyDescription(pluginRoot),
    source,
    desktopSource: toDesktopSource(source),
    path: pluginRoot,
    manifestPath: hasManifest ? manifestPath : "",
    filePath: getPrimaryPluginFilePath(pluginRoot, hasManifest ? manifestPath : "", hasManifest),
    isLegacy,
    isEnabled: getPluginEnabledState(name),
    scopes,
    loadError,
    components: {
      skills: Array.from(new Set(skillsPaths)),
      tools: Array.from(new Set(toolsPaths)),
      hooks: Array.from(new Set(hooksPaths)),
      commands: Array.from(new Set(commandsPaths)),
      agents: Array.from(new Set(agentsPaths)),
    },
    updatedAt: new Date().toISOString(),
  };
}

class PluginManager {
  getCatalog() {
    const mergedByName = new Map();

    for (const sourceRoot of getSourceRoots()) {
      for (const pluginRoot of listCandidatePluginRoots(sourceRoot.rootPath)) {
        const entry = buildCatalogEntry(pluginRoot, sourceRoot.source);
        mergedByName.set(entry.name, entry);
      }
    }

    const sourceOrder = new Map(SOURCE_PRECEDENCE.map((source, index) => [source, index]));
    return Array.from(mergedByName.values())
      .sort((left, right) => {
        const sourceDelta = (sourceOrder.get(left.source) || 0) - (sourceOrder.get(right.source) || 0);
        if (sourceDelta !== 0) {
          return sourceDelta;
        }
        return left.name.localeCompare(right.name);
      });
  }

  getEnabledPluginNames() {
    return this.getCatalog()
      .filter((plugin) => plugin.isEnabled && !plugin.loadError)
      .map((plugin) => plugin.name);
  }

  getPluginTree(pluginId) {
    const plugins = this.getCatalog();
    const plugin = plugins.find((entry) => entry.id === pluginId);
    if (!plugin) {
      return null;
    }

    return this.buildPluginTreeNode(plugin.path, plugin.path);
  }

  readPluginFile(filePath) {
    if (!filePath || typeof filePath !== "string") {
      throw new Error("A file path is required.");
    }

    const targetPath = path.resolve(filePath);
    const allowedRoots = this.getCatalog().map((plugin) => plugin.path);
    const isAllowed = allowedRoots.some((rootPath) => this.isPathInside(rootPath, targetPath));
    if (!isAllowed) {
      throw new Error("File path is outside of known plugin directories.");
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

  getExternalPaths() {
    return getExternalPaths();
  }

  setPluginEnabled(pluginName, enabled) {
    runtimeConfigStore.setPluginEnabled(pluginName, enabled);
    return this.getCatalog();
  }

  buildPluginTreeNode(currentPath, rootPath) {
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
      .filter((entry) => entry.isDirectory() || isLikelyTextFile(entry.name))
      .sort((left, right) => {
        if (left.isDirectory() !== right.isDirectory()) {
          return left.isDirectory() ? -1 : 1;
        }
        return left.name.localeCompare(right.name, undefined, { sensitivity: "base", numeric: true });
      });

    node.children = sorted.map((entry) => this.buildPluginTreeNode(path.join(currentPath, entry.name), rootPath));
    return node;
  }

  isPathInside(parentDir, targetPath) {
    const parent = path.resolve(parentDir);
    const target = path.resolve(targetPath);
    const parentWithSep = parent.endsWith(path.sep) ? parent : `${parent}${path.sep}`;
    return target === parent || target.startsWith(parentWithSep);
  }
}

const pluginManager = new PluginManager();

module.exports = {
  PluginManager,
  pluginManager,
};
