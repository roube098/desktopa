const path = require("path");

const IPV4_SEGMENT_PATTERN = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

function isIpv4Address(value) {
  const candidate = String(value || "").trim();
  if (!candidate) return false;
  const parts = candidate.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => IPV4_SEGMENT_PATTERN.test(part));
}

function parseGatewayIps(rawOutput) {
  const tokens = String(rawOutput || "")
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const unique = [];
  const seen = new Set();
  for (const token of tokens) {
    if (!isIpv4Address(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    unique.push(token);
  }
  return unique;
}

function pickIpv4DirectoryNames(entries) {
  const unique = [];
  const seen = new Set();
  for (const entry of entries || []) {
    const name = String(entry || "").trim();
    if (!isIpv4Address(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    unique.push(name);
  }
  return unique;
}

function mergeClientDirectoryNames(options = {}) {
  const gatewayIps = pickIpv4DirectoryNames(options.gatewayIps || []);
  const discoveredDirNames = pickIpv4DirectoryNames(options.discoveredDirNames || []);
  const legacyDirName = String(options.legacyDirName || "").trim();

  const unique = [];
  const seen = new Set();
  const ordered = [...gatewayIps, ...discoveredDirNames, legacyDirName];
  for (const name of ordered) {
    if (!isIpv4Address(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    unique.push(name);
  }
  return unique;
}

function buildClientDirs(rootDir, dirNames, pathApi = path) {
  const root = String(rootDir || "").trim();
  if (!root) return [];
  return (dirNames || []).map((dirName) => pathApi.join(root, dirName));
}

function findFirstExistingFilePath(fileName, clientDirs, fsApi) {
  const safeFileName = path.basename(String(fileName || "").trim());
  if (!safeFileName) return "";
  const fsImpl = fsApi || require("fs");

  for (const clientDir of clientDirs || []) {
    const candidate = path.join(clientDir, safeFileName);
    try {
      if (fsImpl.existsSync(candidate)) return candidate;
    } catch (_error) {
      // Skip unreadable entries.
    }
  }
  return "";
}

function findFirstTemplatePath(format, clientDirs, fsApi) {
  const ext = String(format || "").trim().toLowerCase().replace(/^\./, "");
  if (!ext) return "";
  const fsImpl = fsApi || require("fs");
  const preferredNames = [`new.${ext}`, `new (1).${ext}`];

  for (const clientDir of clientDirs || []) {
    for (const preferredName of preferredNames) {
      const candidate = path.join(clientDir, preferredName);
      try {
        if (fsImpl.existsSync(candidate)) return candidate;
      } catch (_error) {
        // Continue searching.
      }
    }
  }

  for (const clientDir of clientDirs || []) {
    let entries = [];
    try {
      entries = fsImpl.readdirSync(clientDir, { withFileTypes: true });
    } catch (_error) {
      continue;
    }

    const fallback = entries.find((entry) =>
      entry && entry.isFile && entry.isFile() && path.extname(entry.name).toLowerCase() === `.${ext}`);
    if (fallback) {
      return path.join(clientDir, fallback.name);
    }
  }

  return "";
}

module.exports = {
  isIpv4Address,
  parseGatewayIps,
  pickIpv4DirectoryNames,
  mergeClientDirectoryNames,
  buildClientDirs,
  findFirstExistingFilePath,
  findFirstTemplatePath,
};

