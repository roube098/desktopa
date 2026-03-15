const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { resolveExcelorRuntimePaths } = require("../lib/excelor-runtime-paths");

test("resolveExcelorRuntimePaths returns development paths", () => {
  const mainDir = path.join("C:", "repo", "desktop");
  const result = resolveExcelorRuntimePaths({
    appIsPackaged: false,
    mainDir,
    resourcesPath: path.join("C:", "ignored"),
  });

  assert.equal(result.mode, "development");
  assert.equal(result.rootDir, path.join("C:", "repo"));
  assert.equal(result.excelorDir, path.join("C:", "repo", "excelor"));
  assert.equal(result.bundledBunPath, path.join("C:", "repo", "desktop", "vendor", "bun", "win32-x64", "bun.exe"));
});

test("resolveExcelorRuntimePaths returns packaged paths", () => {
  const mainDir = path.join("C:", "repo", "desktop");
  const resourcesPath = path.join("C:", "Program Files", "Excelor", "resources");
  const result = resolveExcelorRuntimePaths({
    appIsPackaged: true,
    mainDir,
    resourcesPath,
  });

  assert.equal(result.mode, "packaged");
  assert.equal(result.rootDir, resourcesPath);
  assert.equal(result.excelorDir, path.join(resourcesPath, "excelor"));
  assert.equal(result.bundledBunPath, path.join(resourcesPath, "vendor", "bun", "win32-x64", "bun.exe"));
});
