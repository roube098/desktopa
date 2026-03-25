const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_ACCOUNT_ID = "default";
const DEFAULT_HEARTBEAT_CHECKLIST = `- Major index moves (S&P 500, NASDAQ, Dow) - alert if any move more than 2% in a session
- Breaking financial news - major earnings surprises, Fed announcements, significant market events`;

function resolveHeartbeatPaths(options = {}) {
  const baseDir = options.baseDir || path.join(os.homedir(), ".excelor");
  return {
    baseDir,
    gatewayPath: options.gatewayPath || path.join(baseDir, "gateway.json"),
    heartbeatPath: options.heartbeatPath || path.join(baseDir, "HEARTBEAT.md"),
    authDirDefault: path.join(baseDir, "credentials", "whatsapp", DEFAULT_ACCOUNT_ID),
  };
}

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function sanitizeAllowFrom(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => String(entry || "").trim()).filter(Boolean)));
}

function sanitizeDays(value) {
  if (!Array.isArray(value)) return [1, 2, 3, 4, 5];
  const days = Array.from(new Set(
    value
      .map((entry) => Number.parseInt(String(entry), 10))
      .filter((entry) => Number.isFinite(entry) && entry >= 0 && entry <= 6),
  ));
  return days.length > 0 ? days : [1, 2, 3, 4, 5];
}

function sanitizeInterval(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(5, parsed);
}

function parseLinkedPhone(authDir) {
  try {
    const credsPath = path.join(authDir, "creds.json");
    if (!fs.existsSync(credsPath)) return null;
    const raw = JSON.parse(fs.readFileSync(credsPath, "utf8"));
    const jid = raw?.me?.id;
    if (typeof jid !== "string") return null;
    const match = jid.match(/^(\d+):/);
    return match ? `+${match[1]}` : null;
  } catch (_error) {
    return null;
  }
}

function readGatewayRaw(paths) {
  try {
    if (!fs.existsSync(paths.gatewayPath)) {
      return {};
    }
    return asObject(JSON.parse(fs.readFileSync(paths.gatewayPath, "utf8")));
  } catch (_error) {
    return {};
  }
}

function writeGatewayRaw(paths, raw) {
  ensureParentDir(paths.gatewayPath);
  fs.writeFileSync(paths.gatewayPath, JSON.stringify(raw, null, 2), "utf8");
}

function readChecklist(paths) {
  try {
    if (!fs.existsSync(paths.heartbeatPath)) {
      return DEFAULT_HEARTBEAT_CHECKLIST;
    }
    return fs.readFileSync(paths.heartbeatPath, "utf8");
  } catch (_error) {
    return DEFAULT_HEARTBEAT_CHECKLIST;
  }
}

function saveHeartbeatChecklist(checklist, options = {}) {
  const paths = resolveHeartbeatPaths(options);
  ensureParentDir(paths.heartbeatPath);
  fs.writeFileSync(paths.heartbeatPath, String(checklist ?? ""), "utf8");
}

function normalizeSettings(raw, paths) {
  const gateway = asObject(raw.gateway);
  const channels = asObject(raw.channels);
  const whatsapp = asObject(channels.whatsapp);
  const accounts = asObject(whatsapp.accounts);
  const account = asObject(accounts[DEFAULT_ACCOUNT_ID]);
  const heartbeat = asObject(gateway.heartbeat);
  const activeHours = asObject(heartbeat.activeHours);
  const authDir = typeof account.authDir === "string" && account.authDir.trim()
    ? account.authDir
    : paths.authDirDefault;

  return {
    whatsapp: {
      accountId: DEFAULT_ACCOUNT_ID,
      enabled: whatsapp.enabled !== false,
      linkedPhone: parseLinkedPhone(authDir),
      authDir,
      allowFrom: sanitizeAllowFrom(whatsapp.allowFrom),
    },
    heartbeat: {
      enabled: heartbeat.enabled === true,
      intervalMinutes: sanitizeInterval(heartbeat.intervalMinutes),
      activeHours: {
        start: typeof activeHours.start === "string" ? activeHours.start : "09:30",
        end: typeof activeHours.end === "string" ? activeHours.end : "16:00",
        timezone: typeof activeHours.timezone === "string" ? activeHours.timezone : "America/New_York",
        daysOfWeek: sanitizeDays(activeHours.daysOfWeek),
      },
    },
    checklist: readChecklist(paths),
  };
}

function applyPatch(raw, patch, paths) {
  const next = asObject(raw);
  const gateway = asObject(next.gateway);
  const channels = asObject(next.channels);
  const whatsapp = asObject(channels.whatsapp);
  const accounts = asObject(whatsapp.accounts);
  const account = asObject(accounts[DEFAULT_ACCOUNT_ID]);
  const heartbeat = asObject(gateway.heartbeat);
  const activeHours = asObject(heartbeat.activeHours);

  next.gateway = gateway;
  next.channels = channels;
  channels.whatsapp = whatsapp;
  whatsapp.accounts = accounts;
  accounts[DEFAULT_ACCOUNT_ID] = account;
  gateway.accountId = DEFAULT_ACCOUNT_ID;

  if (patch?.whatsapp) {
    if (typeof patch.whatsapp.enabled === "boolean") {
      whatsapp.enabled = patch.whatsapp.enabled;
    }
    if (Array.isArray(patch.whatsapp.allowFrom)) {
      whatsapp.allowFrom = sanitizeAllowFrom(patch.whatsapp.allowFrom);
    }
    if (typeof patch.whatsapp.authDir === "string" && patch.whatsapp.authDir.trim()) {
      account.authDir = patch.whatsapp.authDir.trim();
    } else if (!account.authDir) {
      account.authDir = paths.authDirDefault;
    }
    if (typeof account.enabled !== "boolean") {
      account.enabled = true;
    }
  }

  if (patch?.heartbeat) {
    gateway.heartbeat = heartbeat;
    if (typeof patch.heartbeat.enabled === "boolean") {
      heartbeat.enabled = patch.heartbeat.enabled;
    }
    if (patch.heartbeat.intervalMinutes !== undefined) {
      heartbeat.intervalMinutes = sanitizeInterval(patch.heartbeat.intervalMinutes);
    }
    if (patch.heartbeat.activeHours) {
      heartbeat.activeHours = activeHours;
      if (typeof patch.heartbeat.activeHours.start === "string" && patch.heartbeat.activeHours.start.trim()) {
        activeHours.start = patch.heartbeat.activeHours.start;
      }
      if (typeof patch.heartbeat.activeHours.end === "string" && patch.heartbeat.activeHours.end.trim()) {
        activeHours.end = patch.heartbeat.activeHours.end;
      }
      if (typeof patch.heartbeat.activeHours.timezone === "string" && patch.heartbeat.activeHours.timezone.trim()) {
        activeHours.timezone = patch.heartbeat.activeHours.timezone;
      }
      if (Array.isArray(patch.heartbeat.activeHours.daysOfWeek)) {
        activeHours.daysOfWeek = sanitizeDays(patch.heartbeat.activeHours.daysOfWeek);
      }
    }
  }

  return next;
}

function loadHeartbeatSettings(options = {}) {
  const paths = resolveHeartbeatPaths(options);
  const raw = readGatewayRaw(paths);
  return normalizeSettings(raw, paths);
}

function updateHeartbeatSettings(patch, options = {}) {
  const paths = resolveHeartbeatPaths(options);
  const raw = readGatewayRaw(paths);
  const nextRaw = applyPatch(raw, patch || {}, paths);
  writeGatewayRaw(paths, nextRaw);

  if (Object.prototype.hasOwnProperty.call(patch || {}, "checklist")) {
    saveHeartbeatChecklist(String(patch.checklist ?? ""), options);
  }

  return loadHeartbeatSettings(options);
}

module.exports = {
  DEFAULT_ACCOUNT_ID,
  DEFAULT_HEARTBEAT_CHECKLIST,
  resolveHeartbeatPaths,
  loadHeartbeatSettings,
  updateHeartbeatSettings,
  saveHeartbeatChecklist,
};
