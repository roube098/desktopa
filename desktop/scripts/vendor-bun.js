const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const { spawnSync, execFileSync } = require("child_process");

const DEFAULT_BUN_VERSION = "1.2.22";
const BUN_VERSION = String(process.env.BUN_VENDOR_VERSION || DEFAULT_BUN_VERSION).replace(/^bun-v?/i, "");
const RELEASE_TAG = `bun-v${BUN_VERSION}`;
const PLATFORM = process.platform;
const ARCH = process.arch;

const SCRIPT_DIR = __dirname;
const DESKTOP_DIR = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(DESKTOP_DIR, "..");
const EXCELOR_DIR = path.join(REPO_ROOT, "excelor");
const VENDOR_DIR = path.join(DESKTOP_DIR, "vendor", "bun", "win32-x64");
const BUN_EXE_PATH = path.join(VENDOR_DIR, "bun.exe");
const EXCELOR_NODE_MODULES = path.join(EXCELOR_DIR, "node_modules");

function log(message) {
  process.stdout.write(`[bun:vendor] ${message}\n`);
}

function isSkipped() {
  return process.env.SKIP_BUN_VENDOR === "1";
}

function isWindowsX64() {
  return PLATFORM === "win32" && ARCH === "x64";
}

function getBunVersion(executablePath) {
  try {
    return execFileSync(executablePath, ["--version"], {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
      windowsHide: true,
    }).toString().trim();
  } catch (_error) {
    return "";
  }
}

function ensureDir(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function removePath(targetPath) {
  if (!targetPath) return;
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function downloadFile(url, destinationPath) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        downloadFile(response.headers.location, destinationPath).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed (${response.statusCode}) from ${url}`));
        return;
      }

      ensureDir(path.dirname(destinationPath));
      const stream = fs.createWriteStream(destinationPath);
      response.pipe(stream);

      stream.on("finish", () => {
        stream.close(() => resolve(destinationPath));
      });

      stream.on("error", (error) => {
        removePath(destinationPath);
        reject(error);
      });
    });

    request.on("error", (error) => {
      reject(error);
    });
  });
}

function extractArchive(zipPath, destinationPath) {
  const command = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destinationPath.replace(/'/g, "''")}' -Force`,
  ];

  const result = spawnSync("powershell", command, {
    stdio: "inherit",
    windowsHide: true,
  });

  if (result.status !== 0) {
    throw new Error(`Expand-Archive failed with exit code ${result.status}`);
  }
}

function findFile(rootDir, filename) {
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) {
        return fullPath;
      }
    }
  }

  return "";
}

function ensureBundledBun() {
  const currentVersion = getBunVersion(BUN_EXE_PATH);
  if (currentVersion === BUN_VERSION) {
    log(`bun.exe already vendored (${currentVersion})`);
    return;
  }

  const archiveUrl = `https://github.com/oven-sh/bun/releases/download/${RELEASE_TAG}/bun-windows-x64.zip`;
  const tempRoot = path.join(os.tmpdir(), `bun-vendor-${Date.now().toString(36)}`);
  const archivePath = path.join(tempRoot, "bun-windows-x64.zip");
  const extractPath = path.join(tempRoot, "extract");

  ensureDir(tempRoot);

  log(`downloading ${archiveUrl}`);
  return downloadFile(archiveUrl, archivePath)
    .then(() => {
      log("extracting bun archive");
      extractArchive(archivePath, extractPath);

      const extractedBun = findFile(extractPath, "bun.exe");
      if (!extractedBun) {
        throw new Error("bun.exe not found in downloaded archive.");
      }

      ensureDir(VENDOR_DIR);
      fs.copyFileSync(extractedBun, BUN_EXE_PATH);

      const installedVersion = getBunVersion(BUN_EXE_PATH);
      if (!installedVersion) {
        throw new Error("vendored bun.exe failed validation.");
      }

      fs.writeFileSync(path.join(VENDOR_DIR, "version.txt"), `${installedVersion}\n`, "utf8");
      log(`vendored bun ready at ${BUN_EXE_PATH} (${installedVersion})`);
    })
    .finally(() => {
      removePath(tempRoot);
    });
}

function installExcelorDependencies() {
  if (process.env.SKIP_EXCELOR_BUN_INSTALL === "1") {
    log("skipping excelor dependency install (SKIP_EXCELOR_BUN_INSTALL=1)");
    return;
  }

  if (!fs.existsSync(path.join(EXCELOR_DIR, "package.json"))) {
    log("excelor package.json not found, skipping dependency install");
    return;
  }

  if (fs.existsSync(EXCELOR_NODE_MODULES) && process.env.FORCE_EXCELOR_BUN_INSTALL !== "1") {
    log("excelor/node_modules already present; skipping install");
    return;
  }

  log("installing excelor dependencies with bundled bun");

  const frozenResult = spawnSync(BUN_EXE_PATH, ["install", "--frozen-lockfile"], {
    cwd: EXCELOR_DIR,
    stdio: "inherit",
    windowsHide: true,
  });

  if (frozenResult.status === 0) {
    return;
  }

  log("frozen-lockfile install failed, retrying with plain bun install");
  const plainResult = spawnSync(BUN_EXE_PATH, ["install"], {
    cwd: EXCELOR_DIR,
    stdio: "inherit",
    windowsHide: true,
  });

  if (plainResult.status !== 0) {
    throw new Error(`bun install failed for excelor (exit code ${plainResult.status}).`);
  }
}

async function main() {
  if (isSkipped()) {
    log("skipped (SKIP_BUN_VENDOR=1)");
    return;
  }

  if (!isWindowsX64()) {
    log(`skipped (unsupported platform ${PLATFORM}/${ARCH}; only win32/x64 is targeted)`);
    return;
  }

  await ensureBundledBun();
  installExcelorDependencies();
}

main().catch((error) => {
  console.error(`[bun:vendor] ${error.message || String(error)}`);
  process.exitCode = 1;
});
