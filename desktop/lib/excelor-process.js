/**
 * ExcelorProcess - spawns and manages the Excelor bun server as a child process.
 * Emits: 'ready', 'error', 'exit'
 */
const { EventEmitter } = require("events");
const { spawn, execFileSync } = require("child_process");
const http = require("http");
const https = require("https");
const path = require("path");
const fs = require("fs");
const os = require("os");

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// First-run Bun startup on Windows can take well beyond 15s while dependencies compile.
const READY_TIMEOUT_MS = parsePositiveInteger(process.env.EXCELOR_READY_TIMEOUT_MS, 60000);
const HEALTH_PROBE_INTERVAL_MS = 250;
const HEALTH_PROBE_REQUEST_TIMEOUT_MS = 1500;
const RESTART_DELAY_MS = 3000;
const MAX_RESTARTS = 5;
const LOG_TAIL_MAX_CHARS = 400;

function normalizeCandidate(candidate) {
  return String(candidate || "").trim();
}

function uniqCandidates(candidates) {
  const seen = new Set();
  const result = [];

  for (const candidate of candidates) {
    const normalized = normalizeCandidate(candidate);
    if (!normalized) continue;

    const key = process.platform === "win32" ? normalized.toLowerCase() : normalized;
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function resolveBunCandidates({ bundledBunPath, overridePath } = {}) {
  const homeDir = os.homedir();
  const userProfile = process.env.USERPROFILE || homeDir;
  const localAppData = process.env.LOCALAPPDATA || path.join(userProfile, "AppData", "Local");
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const explicitOverride = overridePath || process.env.EXCELOR_BUN_PATH;

  return uniqCandidates([
    explicitOverride,
    bundledBunPath,
    "bun.exe",
    "bun",
    path.join(homeDir, ".bun", "bin", "bun.exe"),
    path.join(homeDir, ".bun", "bin", "bun"),
    path.join(userProfile, ".bun", "bin", "bun.exe"),
    path.join(localAppData, "bun", "bin", "bun.exe"),
    path.join(localAppData, "Programs", "Bun", "bun.exe"),
    path.join(programFiles, "Bun", "bun.exe"),
  ]);
}

function isBunExecutable(candidate, execFile = execFileSync) {
  try {
    execFile(candidate, ["--version"], {
      stdio: "ignore",
      timeout: 8000,
      windowsHide: true,
    });
    return true;
  } catch (_error) {
    return false;
  }
}

function findBunExecutable(options = {}) {
  const candidates = resolveBunCandidates(options);
  const checkedPaths = [];

  for (const candidate of candidates) {
    checkedPaths.push(candidate);
    // If bun.exe is physically present, allow runtime spawn to be the source of truth.
    // This avoids false negatives from strict preflight checks in some Electron environments.
    try {
      if (path.isAbsolute(candidate) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return { bunPath: candidate, checkedPaths };
      }
    } catch (_error) {
      // Ignore stat/read errors and continue with executable probing.
    }
    if (isBunExecutable(candidate, options.execFileSyncImpl || execFileSync)) {
      return { bunPath: candidate, checkedPaths };
    }
  }

  return { bunPath: null, checkedPaths };
}

function buildBunNotFoundMessage(checkedPaths = []) {
  const checked = checkedPaths.length > 0
    ? checkedPaths.map((item) => `- ${item}`).join("\n")
    : "- (no candidates generated)";

  return [
    "bun executable not found.",
    "Checked these locations:",
    checked,
    "Set EXCELOR_BUN_PATH to a valid bun.exe path, or run `npm run bun:vendor` in the desktop folder.",
    "Manual install (Windows): powershell -c \"irm bun.sh/install.ps1|iex\"",
  ].join("\n");
}

function trimLogTail(value, maxChars = LOG_TAIL_MAX_CHARS) {
  const text = String(value || "");
  if (text.length <= maxChars) return text;
  return text.slice(-maxChars);
}

function appendLogTail(current, chunk, maxChars = LOG_TAIL_MAX_CHARS) {
  return trimLogTail(`${current || ""}${String(chunk || "")}`, maxChars);
}

function buildReadyTimeoutMessage({ healthUrl, readyTimeoutMs, stdoutTail, stderrTail }) {
  const details = [
    `Excelor server did not become ready within ${readyTimeoutMs}ms.`,
    `Health check: ${healthUrl}`,
  ];

  const stdoutText = String(stdoutTail || "").trim();
  const stderrText = String(stderrTail || "").trim();

  if (stdoutText) {
    details.push(`stdout tail:\n${stdoutText}`);
  }
  if (stderrText) {
    details.push(`stderr tail:\n${stderrText}`);
  }

  return details.join("\n");
}

function buildEarlyExitMessage({ code, signal, stdoutTail, stderrTail }) {
  const details = [
    `Excelor server exited before it became ready (code: ${code ?? "null"}, signal: ${signal ?? "null"}).`,
  ];

  const stdoutText = String(stdoutTail || "").trim();
  const stderrText = String(stderrTail || "").trim();

  if (stdoutText) {
    details.push(`stdout tail:\n${stdoutText}`);
  }
  if (stderrText) {
    details.push(`stderr tail:\n${stderrText}`);
  }

  return details.join("\n");
}

function probeExcelorHealth(url, options = {}) {
  const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs)
    ? Number(options.requestTimeoutMs)
    : HEALTH_PROBE_REQUEST_TIMEOUT_MS;

  return new Promise((resolve) => {
    let requestUrl;
    try {
      requestUrl = new URL(url);
    } catch (_error) {
      resolve(false);
      return;
    }

    const transport = requestUrl.protocol === "https:" ? https : http;
    const request = transport.get(requestUrl, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });

    request.on("error", () => resolve(false));
    request.setTimeout(requestTimeoutMs, () => {
      request.destroy(new Error("timeout"));
    });
  });
}

function terminateChildProcess(proc) {
  if (!proc) return;

  const pid = Number(proc.pid);
  try {
    proc.kill();
  } catch (_error) {
    // Ignore graceful-kill failures and try the Windows fallback below.
  }

  if (process.platform !== "win32" || !Number.isFinite(pid) || pid <= 0) {
    return;
  }

  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      timeout: 8000,
      windowsHide: true,
    });
  } catch (_error) {
    // Ignore taskkill failures; the process may already be exiting.
  }
}

class ExcelorProcess extends EventEmitter {
  constructor({
    rootDir,
    excelorDir,
    bundledBunPath,
    port,
    extraEnv = {},
    spawnImpl = spawn,
    findBunExecutableImpl = findBunExecutable,
    existsSyncImpl = fs.existsSync,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
    healthCheck = probeExcelorHealth,
    stdoutWriter = (text) => process.stdout.write(text),
    stderrWriter = (text) => process.stderr.write(text),
    readyTimeoutMs = READY_TIMEOUT_MS,
    healthProbeIntervalMs = HEALTH_PROBE_INTERVAL_MS,
    healthProbeRequestTimeoutMs = HEALTH_PROBE_REQUEST_TIMEOUT_MS,
    restartDelayMs = RESTART_DELAY_MS,
  }) {
    super();
    this.rootDir = rootDir;
    this.excelorDir = excelorDir || path.join(rootDir, "excelor");
    this.bundledBunPath = bundledBunPath || "";
    this.port = port;
    this.extraEnv = extraEnv;
    this.spawnImpl = spawnImpl;
    this.findBunExecutableImpl = findBunExecutableImpl;
    this.existsSyncImpl = existsSyncImpl;
    this.setTimeoutImpl = setTimeoutImpl;
    this.clearTimeoutImpl = clearTimeoutImpl;
    this.healthCheck = healthCheck;
    this.stdoutWriter = stdoutWriter;
    this.stderrWriter = stderrWriter;
    this.readyTimeoutMs = readyTimeoutMs;
    this.healthProbeIntervalMs = healthProbeIntervalMs;
    this.healthProbeRequestTimeoutMs = healthProbeRequestTimeoutMs;
    this.restartDelayMs = restartDelayMs;
    this.proc = null;
    this.restartCount = 0;
    this.stopped = false;
    this._readyTimer = null;
    this._healthProbeTimer = null;
    this._restartTimer = null;
    this._healthProbeInFlight = false;
    this._readyEmitted = false;
    this._launchFailed = false;
    this._preventRestart = false;
    this._stdoutTail = "";
    this._stderrTail = "";
  }

  get serverUrl() {
    return `http://localhost:${this.port}`;
  }

  _scheduleTimer(callback, delay) {
    const timer = this.setTimeoutImpl(callback, delay);
    if (timer && typeof timer.unref === "function") {
      timer.unref();
    }
    return timer;
  }

  _clearTimer(timer) {
    if (!timer) return null;
    this.clearTimeoutImpl(timer);
    return null;
  }

  _clearStartupTimers() {
    this._readyTimer = this._clearTimer(this._readyTimer);
    this._healthProbeTimer = this._clearTimer(this._healthProbeTimer);
    this._healthProbeInFlight = false;
  }

  _resetStartupState() {
    this._clearStartupTimers();
    this._readyEmitted = false;
    this._launchFailed = false;
    this._preventRestart = false;
    this._stdoutTail = "";
    this._stderrTail = "";
  }

  _emitStartupError(error, options = {}) {
    if (this._readyEmitted || this._launchFailed) return;

    this._launchFailed = true;
    if (options.preventRestart === true) {
      this._preventRestart = true;
    }
    this._clearStartupTimers();
    this.emit("error", error);

    if (options.killProcess === true && this.proc) {
      terminateChildProcess(this.proc);
    }
  }

  _markReady() {
    if (this._readyEmitted || this._launchFailed) return;
    this._readyEmitted = true;
    this._clearStartupTimers();
    this.restartCount = 0;
    this.emit("ready");
  }

  _scheduleHealthProbe(delayMs = 0) {
    if (this.stopped || !this.proc || this._readyEmitted || this._launchFailed) return;
    this._healthProbeTimer = this._clearTimer(this._healthProbeTimer);
    this._healthProbeTimer = this._scheduleTimer(() => {
      this._healthProbeTimer = null;
      void this._runHealthProbe();
    }, delayMs);
  }

  async _runHealthProbe() {
    if (
      this.stopped ||
      !this.proc ||
      this._readyEmitted ||
      this._launchFailed ||
      this._healthProbeInFlight
    ) {
      return;
    }

    this._healthProbeInFlight = true;
    let healthy = false;
    try {
      healthy = await this.healthCheck(`${this.serverUrl}/health`, {
        requestTimeoutMs: this.healthProbeRequestTimeoutMs,
      });
    } catch (_error) {
      healthy = false;
    } finally {
      this._healthProbeInFlight = false;
    }

    if (this.stopped || !this.proc || this._readyEmitted || this._launchFailed) {
      return;
    }

    if (healthy) {
      this._markReady();
      return;
    }

    this._scheduleHealthProbe(this.healthProbeIntervalMs);
  }

  start() {
    if (this.stopped) return;

    const { bunPath, checkedPaths } = this.findBunExecutableImpl({
      bundledBunPath: this.bundledBunPath,
    });
    if (!bunPath) {
      this.emit("error", new Error(buildBunNotFoundMessage(checkedPaths)));
      return;
    }

    const excelorDir = this.excelorDir;
    const serverScript = path.join(excelorDir, "src", "server.ts");

    if (!this.existsSyncImpl(serverScript)) {
      this.emit("error", new Error(`Excelor server not found at ${serverScript}`));
      return;
    }

    const env = {
      ...process.env,
      EXCELOR_PORT: String(this.port),
      ...this.extraEnv,
    };

    console.log(`[excelor-process] Starting: ${bunPath} run ${serverScript}`);

    this._resetStartupState();
    this.proc = this.spawnImpl(bunPath, ["run", serverScript], {
      cwd: excelorDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.proc.on("error", (error) => {
      this._emitStartupError(
        new Error(`Failed to launch bun at ${bunPath}: ${error.message || String(error)}`),
        { preventRestart: true },
      );
    });

    this._readyTimer = this._scheduleTimer(() => {
      const message = buildReadyTimeoutMessage({
        healthUrl: `${this.serverUrl}/health`,
        readyTimeoutMs: this.readyTimeoutMs,
        stdoutTail: this._stdoutTail,
        stderrTail: this._stderrTail,
      });
      this._emitStartupError(new Error(message), {
        preventRestart: true,
        killProcess: true,
      });
    }, this.readyTimeoutMs);

    this._scheduleHealthProbe(0);

    this.proc.stdout.on("data", (data) => {
      const text = data.toString();
      this._stdoutTail = appendLogTail(this._stdoutTail, text);
      this.stdoutWriter(`[excelor] ${text}`);
      if (text.includes("listening on")) {
        this._scheduleHealthProbe(0);
      }
    });

    this.proc.stderr.on("data", (data) => {
      const text = data.toString();
      this._stderrTail = appendLogTail(this._stderrTail, text);
      this.stderrWriter(`[excelor:err] ${text}`);
    });

    this.proc.on("exit", (code, signal) => {
      const exitedBeforeReady = !this.stopped && !this._readyEmitted && !this._launchFailed;
      if (exitedBeforeReady) {
        const message = buildEarlyExitMessage({
          code,
          signal,
          stdoutTail: this._stdoutTail,
          stderrTail: this._stderrTail,
        });
        this._emitStartupError(new Error(message), { preventRestart: true });
      }

      this._clearStartupTimers();
      this.proc = null;
      this.emit("exit", { code, signal });

      if (!this.stopped && !this._preventRestart && this.restartCount < MAX_RESTARTS) {
        this.restartCount++;
        console.log(`[excelor-process] Restarting (attempt ${this.restartCount})...`);
        this._restartTimer = this._scheduleTimer(
          () => this.start(),
          this.restartDelayMs * this.restartCount,
        );
      } else if (!this.stopped && !this._preventRestart) {
        this.emit("error", new Error("Excelor server crashed too many times."));
      }
    });
  }

  stop() {
    this.stopped = true;
    this._clearStartupTimers();
    this._restartTimer = this._clearTimer(this._restartTimer);
    if (this.proc) {
      terminateChildProcess(this.proc);
      this.proc = null;
    }
  }
}

module.exports = ExcelorProcess;
module.exports.resolveBunCandidates = resolveBunCandidates;
module.exports.findBunExecutable = findBunExecutable;
module.exports.buildBunNotFoundMessage = buildBunNotFoundMessage;
module.exports.probeExcelorHealth = probeExcelorHealth;
