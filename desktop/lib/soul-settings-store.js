const fs = require("fs");
const os = require("os");
const path = require("path");

function resolveSoulPaths(options = {}) {
  const baseDir = options.baseDir || path.join(os.homedir(), ".excelor");
  return {
    baseDir,
    userPath: options.userPath || path.join(baseDir, "SOUL.md"),
    bundledPath: options.bundledPath || null,
  };
}

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readTextIfAvailable(filePath) {
  if (!filePath) return null;
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return fs.readFileSync(filePath, "utf8");
  } catch (_error) {
    return null;
  }
}

function loadSoulSettings(options = {}) {
  const paths = resolveSoulPaths(options);
  const hasUserOverride = fs.existsSync(paths.userPath);
  const userContent = readTextIfAvailable(paths.userPath);
  if (userContent !== null) {
    return {
      content: userContent,
      hasUserOverride,
      source: "user",
      userPath: paths.userPath,
      bundledPath: paths.bundledPath,
    };
  }

  const bundledContent = readTextIfAvailable(paths.bundledPath);
  if (bundledContent !== null) {
    return {
      content: bundledContent,
      hasUserOverride,
      source: "bundled",
      userPath: paths.userPath,
      bundledPath: paths.bundledPath,
    };
  }

  return {
    content: "",
    hasUserOverride,
    source: "empty",
    userPath: paths.userPath,
    bundledPath: paths.bundledPath,
  };
}

function updateSoulSettings(content, options = {}) {
  const paths = resolveSoulPaths(options);
  ensureParentDir(paths.userPath);
  fs.writeFileSync(paths.userPath, String(content ?? ""), "utf8");
  return loadSoulSettings(options);
}

function resetSoulSettings(options = {}) {
  const paths = resolveSoulPaths(options);
  try {
    if (fs.existsSync(paths.userPath)) {
      fs.unlinkSync(paths.userPath);
    }
  } catch (_error) {
    // Keep reset best-effort and return the effective state afterward.
  }
  return loadSoulSettings(options);
}

module.exports = {
  resolveSoulPaths,
  loadSoulSettings,
  updateSoulSettings,
  resetSoulSettings,
};
