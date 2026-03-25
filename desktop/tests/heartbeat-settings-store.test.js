const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  DEFAULT_HEARTBEAT_CHECKLIST,
  loadHeartbeatSettings,
  updateHeartbeatSettings,
} = require("../lib/heartbeat-settings-store");

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "excelor-heartbeat-test-"));
}

test("loadHeartbeatSettings returns defaults when files are missing", () => {
  const baseDir = createTempDir();
  const settings = loadHeartbeatSettings({ baseDir });

  assert.equal(settings.whatsapp.accountId, "default");
  assert.equal(settings.whatsapp.enabled, true);
  assert.equal(settings.whatsapp.linkedPhone, null);
  assert.equal(settings.heartbeat.enabled, false);
  assert.equal(settings.heartbeat.intervalMinutes, 30);
  assert.deepEqual(settings.heartbeat.activeHours.daysOfWeek, [1, 2, 3, 4, 5]);
  assert.equal(settings.checklist, DEFAULT_HEARTBEAT_CHECKLIST);
});

test("updateHeartbeatSettings preserves unrelated gateway.json fields", () => {
  const baseDir = createTempDir();
  const gatewayPath = path.join(baseDir, "gateway.json");
  fs.mkdirSync(baseDir, { recursive: true });
  fs.writeFileSync(gatewayPath, JSON.stringify({
    customField: { keep: true },
    gateway: {
      logLevel: "debug",
      legacyNested: { untouched: "yes" },
    },
    channels: {
      whatsapp: {
        enabled: true,
        allowFrom: ["+10000000000"],
      },
    },
  }, null, 2), "utf8");

  updateHeartbeatSettings({
    heartbeat: {
      enabled: true,
      intervalMinutes: 15,
      activeHours: {
        start: "10:00",
        end: "17:00",
        timezone: "America/New_York",
        daysOfWeek: [1, 3, 5],
      },
    },
  }, { baseDir });

  const raw = JSON.parse(fs.readFileSync(gatewayPath, "utf8"));
  assert.equal(raw.customField.keep, true);
  assert.equal(raw.gateway.legacyNested.untouched, "yes");
  assert.equal(raw.gateway.heartbeat.enabled, true);
  assert.equal(raw.gateway.heartbeat.intervalMinutes, 15);
  assert.deepEqual(raw.gateway.heartbeat.activeHours.daysOfWeek, [1, 3, 5]);
});

test("updateHeartbeatSettings writes checklist verbatim", () => {
  const baseDir = createTempDir();
  const heartbeatPath = path.join(baseDir, "HEARTBEAT.md");
  const content = "- alert one\n\n- alert two";

  updateHeartbeatSettings({ checklist: content }, { baseDir });

  const stored = fs.readFileSync(heartbeatPath, "utf8");
  assert.equal(stored, content);
});
