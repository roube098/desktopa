const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  loadSoulSettings,
  updateSoulSettings,
  resetSoulSettings,
} = require("../lib/soul-settings-store");

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "excelor-soul-test-"));
}

test("loadSoulSettings returns bundled content when user override is missing", () => {
  const baseDir = createTempDir();
  const bundledPath = path.join(baseDir, "bundled-SOUL.md");
  fs.writeFileSync(bundledPath, "# Bundled soul", "utf8");

  const settings = loadSoulSettings({ baseDir, bundledPath });

  assert.equal(settings.content, "# Bundled soul");
  assert.equal(settings.hasUserOverride, false);
  assert.equal(settings.source, "bundled");
  assert.equal(settings.bundledPath, bundledPath);
  assert.equal(settings.userPath, path.join(baseDir, "SOUL.md"));
});

test("loadSoulSettings returns user content when override exists", () => {
  const baseDir = createTempDir();
  const userPath = path.join(baseDir, "SOUL.md");
  const bundledPath = path.join(baseDir, "bundled-SOUL.md");
  fs.writeFileSync(userPath, "# User soul", "utf8");
  fs.writeFileSync(bundledPath, "# Bundled soul", "utf8");

  const settings = loadSoulSettings({ baseDir, bundledPath });

  assert.equal(settings.content, "# User soul");
  assert.equal(settings.hasUserOverride, true);
  assert.equal(settings.source, "user");
});

test("updateSoulSettings writes content verbatim", () => {
  const baseDir = createTempDir();
  const userPath = path.join(baseDir, "SOUL.md");
  const content = "# Soul\n\nLine two\n";

  const settings = updateSoulSettings(content, { baseDir });

  assert.equal(fs.readFileSync(userPath, "utf8"), content);
  assert.equal(settings.content, content);
  assert.equal(settings.source, "user");
  assert.equal(settings.hasUserOverride, true);
});

test("resetSoulSettings removes override and falls back to bundled content", () => {
  const baseDir = createTempDir();
  const userPath = path.join(baseDir, "SOUL.md");
  const bundledPath = path.join(baseDir, "bundled-SOUL.md");
  fs.writeFileSync(userPath, "# User soul", "utf8");
  fs.writeFileSync(bundledPath, "# Bundled soul", "utf8");

  const settings = resetSoulSettings({ baseDir, bundledPath });

  assert.equal(fs.existsSync(userPath), false);
  assert.equal(settings.content, "# Bundled soul");
  assert.equal(settings.hasUserOverride, false);
  assert.equal(settings.source, "bundled");
});

test("loadSoulSettings returns empty state when bundled file is unavailable", () => {
  const baseDir = createTempDir();

  const settings = loadSoulSettings({
    baseDir,
    bundledPath: path.join(baseDir, "missing-SOUL.md"),
  });

  assert.equal(settings.content, "");
  assert.equal(settings.hasUserOverride, false);
  assert.equal(settings.source, "empty");
});
