const fs = require("fs");
const os = require("os");
const path = require("path");

const CANDIDATE_NAMES = [
  "AGENTS.md",
  "agent-config.json",
  "subagents.json",
  path.join(".codex", "agents.json"),
  path.join(".codex", "agent-config.json"),
  path.join(".claude", "agents.json"),
  path.join(".claude", "agent-config.json"),
];

function detectExternalConfigs(rootPaths = []) {
  const roots = rootPaths.filter(Boolean);
  if (roots.length === 0) {
    roots.push(process.cwd(), path.join(os.homedir(), ".codex"));
  }

  const found = [];
  const seen = new Set();

  for (const rootPath of roots) {
    for (const candidate of CANDIDATE_NAMES) {
      const nextPath = path.isAbsolute(candidate) ? candidate : path.join(rootPath, candidate);
      if (!fs.existsSync(nextPath)) {
        continue;
      }
      if (seen.has(nextPath)) {
        continue;
      }
      seen.add(nextPath);
      found.push({
        id: Buffer.from(nextPath).toString("base64url"),
        path: nextPath,
        kind: classifyPath(nextPath),
        detectedAt: new Date().toISOString(),
      });
    }
  }

  return found;
}

function importExternalConfig(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const kind = classifyPath(filePath);
  const agents = [];
  let guidance = "";

  if (kind === "agents-md") {
    guidance = raw;
  } else {
    const parsed = JSON.parse(raw);
    const entries = parsed.agents || parsed.subagents || parsed.roles || [];

    for (const entry of entries) {
      if (!entry || !entry.name) {
        continue;
      }
      agents.push({
        id: slugify(entry.id || entry.name),
        name: entry.name,
        description: entry.description || "",
        prompt: entry.prompt || entry.instructions || "",
        enabled: entry.enabled !== false,
        source: kind,
      });
    }

    if (typeof parsed.guidance === "string") {
      guidance = parsed.guidance;
    }
  }

  return {
    path: filePath,
    kind,
    guidance,
    agents,
  };
}

function classifyPath(filePath) {
  const normalized = filePath.toLowerCase();
  if (normalized.endsWith("agents.md")) {
    return "agents-md";
  }
  if (normalized.includes(".claude")) {
    return "claude-config";
  }
  if (normalized.includes(".codex")) {
    return "codex-config";
  }
  return "json-config";
}

function slugify(value) {
  return String(value)
    .replace(/\.\./g, "")
    .replace(/[\\/]/g, "-")
    .replace(/[^a-zA-Z0-9-_\s]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

module.exports = {
  detectExternalConfigs,
  importExternalConfig,
};
