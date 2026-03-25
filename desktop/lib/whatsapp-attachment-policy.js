const fs = require("fs");
const path = require("path");

function normalizePathForComparison(value) {
  return process.platform === "win32" ? String(value || "").toLowerCase() : String(value || "");
}

function isPathInsideDirectory(parentDir, targetPath) {
  const parent = normalizePathForComparison(path.resolve(parentDir));
  const target = normalizePathForComparison(path.resolve(targetPath));
  const parentWithSep = parent.endsWith(path.sep) ? parent : `${parent}${path.sep}`;
  return target === parent || target.startsWith(parentWithSep);
}

function getRelativeWorkspacePath(workspaceDir, filePath) {
  return path.relative(workspaceDir, filePath).split(path.sep).join("/");
}

function looksLikePathReference(reference) {
  const trimmed = String(reference || "").trim();
  if (!trimmed) return false;
  if (path.isAbsolute(trimmed)) return true;
  if (trimmed.includes("/") || trimmed.includes("\\")) return true;
  return (
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.startsWith("./") ||
    trimmed.startsWith(".\\") ||
    trimmed.startsWith("../") ||
    trimmed.startsWith("..\\")
  );
}

async function assertNoSymlink(relativePath, rootDir) {
  const parts = String(relativePath || "").split(/[\\/]/).filter(Boolean);
  let current = path.resolve(rootDir);
  for (const part of parts) {
    current = path.join(current, part);
    let stat;
    try {
      stat = await fs.promises.lstat(current);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`Symlink not allowed in workspace attachment path: ${current}`);
    }
  }
}

async function assertRegularFile(filePath) {
  let stat;
  try {
    stat = await fs.promises.lstat(filePath);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error(`Workspace attachment not found: ${filePath}`);
    }
    throw error;
  }

  if (stat.isSymbolicLink()) {
    throw new Error(`Symlink not allowed in workspace attachment path: ${filePath}`);
  }
  if (!stat.isFile()) {
    throw new Error("Workspace attachment must be a regular file.");
  }
}

async function findMatchesByBasename(workspaceDir, basename) {
  const queue = [workspaceDir];
  const matches = [];
  const targetName = normalizePathForComparison(path.basename(String(basename || "").trim()));

  while (queue.length > 0) {
    const currentDir = queue.pop();
    let entries = [];
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch (_error) {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      let stat;
      try {
        stat = await fs.promises.lstat(fullPath);
      } catch (_error) {
        continue;
      }

      if (stat.isSymbolicLink()) {
        continue;
      }
      if (stat.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (!stat.isFile()) {
        continue;
      }
      if (normalizePathForComparison(entry.name) === targetName) {
        matches.push(fullPath);
      }
    }
  }

  matches.sort((left, right) =>
    getRelativeWorkspacePath(workspaceDir, left).localeCompare(
      getRelativeWorkspacePath(workspaceDir, right),
      undefined,
      { numeric: true, sensitivity: "base" },
    ),
  );

  return matches;
}

async function resolveWhatsAppAttachmentReference({ workspaceDir, reference }) {
  const normalizedWorkspaceDir = path.resolve(String(workspaceDir || "").trim());
  const trimmedReference = String(reference || "").trim();

  if (!trimmedReference) {
    throw new Error("filePath is required.");
  }

  let resolvedPath = "";
  if (looksLikePathReference(trimmedReference)) {
    resolvedPath = path.isAbsolute(trimmedReference)
      ? path.resolve(trimmedReference)
      : path.resolve(normalizedWorkspaceDir, trimmedReference);
    if (!isPathInsideDirectory(normalizedWorkspaceDir, resolvedPath)) {
      throw new Error("Workspace attachment must be inside My Workspace.");
    }
  } else {
    const matches = await findMatchesByBasename(normalizedWorkspaceDir, trimmedReference);
    if (matches.length === 0) {
      throw new Error(`No workspace file matched "${trimmedReference}".`);
    }
    if (matches.length > 1) {
      const candidates = matches.map((match) => getRelativeWorkspacePath(normalizedWorkspaceDir, match));
      throw new Error(
        `Multiple workspace files matched "${trimmedReference}": ${candidates.join(", ")}.`,
      );
    }
    resolvedPath = matches[0];
  }

  const relativePath = getRelativeWorkspacePath(normalizedWorkspaceDir, resolvedPath);
  await assertNoSymlink(relativePath, normalizedWorkspaceDir);
  if (!isPathInsideDirectory(normalizedWorkspaceDir, resolvedPath)) {
    throw new Error("Workspace attachment must be inside My Workspace.");
  }
  await assertRegularFile(resolvedPath);

  return {
    absolutePath: resolvedPath,
    relativePath,
    fileName: path.basename(resolvedPath),
  };
}

module.exports = {
  getRelativeWorkspacePath,
  isPathInsideDirectory,
  normalizePathForComparison,
  resolveWhatsAppAttachmentReference,
};
