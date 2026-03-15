const path = require("path");
const fs = require("fs");

function resolveExcelorDir(baseDir, preferredDirs = []) {
  for (const dirName of preferredDirs) {
    const candidate = path.join(baseDir, dirName);
    try {
      if (fs.existsSync(path.join(candidate, "src", "server.ts"))) {
        return candidate;
      }
    } catch (_error) {
      // Skip unreadable candidates and keep searching.
    }
  }
  return path.join(baseDir, preferredDirs[0] || "excelor");
}

function resolveExcelorRuntimePaths({ appIsPackaged, mainDir, resourcesPath }) {
  const repoRoot = path.resolve(mainDir, "..");

  if (appIsPackaged) {
    const runtimeRoot = resourcesPath || process.resourcesPath || repoRoot;
    const excelorDir = resolveExcelorDir(runtimeRoot, ["excelor", "dexter"]);
    return {
      rootDir: runtimeRoot,
      excelorDir,
      bundledBunPath: path.join(runtimeRoot, "vendor", "bun", "win32-x64", "bun.exe"),
      mode: "packaged",
    };
  }

  const excelorDir = resolveExcelorDir(repoRoot, ["excelor", "dexter"]);
  return {
    rootDir: repoRoot,
    excelorDir,
    bundledBunPath: path.join(repoRoot, "desktop", "vendor", "bun", "win32-x64", "bun.exe"),
    mode: "development",
  };
}

module.exports = {
  resolveExcelorRuntimePaths,
};
