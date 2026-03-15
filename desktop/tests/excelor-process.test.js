const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("events");
const http = require("http");

const ExcelorProcess = require("../lib/excelor-process");
const {
  resolveBunCandidates,
  findBunExecutable,
  buildBunNotFoundMessage,
  probeExcelorHealth,
} = ExcelorProcess;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createFakeChildProcess() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = () => {
    if (child.killed) return;
    child.killed = true;
    child.emit("exit", null, "SIGTERM");
  };
  return child;
}

function createProcessHarness(options = {}) {
  const child = options.child || createFakeChildProcess();
  const processInstance = new ExcelorProcess({
    rootDir: "C:\\repo",
    excelorDir: "C:\\repo\\dexter",
    bundledBunPath: "C:\\bun.exe",
    port: options.port || 27182,
    findBunExecutableImpl: () => ({ bunPath: "C:\\bun.exe", checkedPaths: ["C:\\bun.exe"] }),
    existsSyncImpl: () => true,
    spawnImpl: () => child,
    stdoutWriter: () => {},
    stderrWriter: () => {},
    readyTimeoutMs: options.readyTimeoutMs || 60,
    healthProbeIntervalMs: options.healthProbeIntervalMs || 5,
    healthProbeRequestTimeoutMs: options.healthProbeRequestTimeoutMs || 10,
    restartDelayMs: options.restartDelayMs || 1000,
    healthCheck: options.healthCheck || (async () => false),
  });

  return { child, processInstance };
}

test("resolveBunCandidates prioritizes override then bundled path", () => {
  const overridePath = "C:\\custom\\bun.exe";
  const bundledBunPath = "C:\\app\\vendor\\bun.exe";
  const candidates = resolveBunCandidates({ overridePath, bundledBunPath });

  assert.equal(candidates[0], overridePath);
  assert.equal(candidates[1], bundledBunPath);
});

test("findBunExecutable selects the first executable candidate", () => {
  const bundledBunPath = "C:\\app\\vendor\\bun.exe";
  const calls = [];
  const execFileSyncImpl = (candidate) => {
    calls.push(candidate);
    if (candidate !== bundledBunPath) {
      const error = new Error("not found");
      error.code = "ENOENT";
      throw error;
    }
  };

  const result = findBunExecutable({ bundledBunPath, execFileSyncImpl });

  assert.equal(result.bunPath, bundledBunPath);
  assert.equal(result.checkedPaths[0], bundledBunPath);
  assert.equal(calls[0], bundledBunPath);
});

test("buildBunNotFoundMessage includes remediation details", () => {
  const message = buildBunNotFoundMessage(["bun.exe", "C:\\missing\\bun.exe"]);

  assert.match(message, /EXCELOR_BUN_PATH/);
  assert.match(message, /npm run bun:vendor/);
  assert.match(message, /install\.ps1/);
});

test("healthy process with empty stdout becomes ready when health probe succeeds", async () => {
  let probeCount = 0;
  const { processInstance } = createProcessHarness({
    healthCheck: async () => {
      probeCount += 1;
      return probeCount >= 2;
    },
  });

  let readyCount = 0;
  let errorCount = 0;
  processInstance.on("ready", () => {
    readyCount += 1;
  });
  processInstance.on("error", () => {
    errorCount += 1;
  });

  processInstance.start();
  await wait(40);

  assert.equal(readyCount, 1);
  assert.equal(errorCount, 0);
  assert.ok(probeCount >= 2);

  processInstance.stop();
});

test("process that never becomes healthy times out with stdout and stderr tails", async () => {
  const { child, processInstance } = createProcessHarness({
    readyTimeoutMs: 50,
    healthProbeIntervalMs: 5,
    healthCheck: async () => false,
  });

  let capturedError = null;
  processInstance.once("error", (error) => {
    capturedError = error;
  });

  processInstance.start();
  child.stdout.emit("data", Buffer.from("warming up silently\n"));
  child.stderr.emit("data", Buffer.from("missing startup dependency\n"));
  await wait(90);

  assert.ok(capturedError);
  assert.match(capturedError.message, /http:\/\/localhost:27182\/health/);
  assert.match(capturedError.message, /warming up silently/);
  assert.match(capturedError.message, /missing startup dependency/);
  assert.equal(child.killed, true);

  processInstance.stop();
});

test("process exit before readiness stops further health probing", async () => {
  let probeCount = 0;
  const { child, processInstance } = createProcessHarness({
    readyTimeoutMs: 80,
    healthProbeIntervalMs: 5,
    healthCheck: async () => {
      probeCount += 1;
      return false;
    },
  });

  let readyCount = 0;
  let errorCount = 0;
  let exitCount = 0;
  processInstance.on("ready", () => {
    readyCount += 1;
  });
  processInstance.on("error", () => {
    errorCount += 1;
  });
  processInstance.on("exit", () => {
    exitCount += 1;
  });

  processInstance.start();
  await wait(20);
  child.emit("exit", 1, null);
  const probeCountAtExit = probeCount;
  await wait(30);

  assert.equal(readyCount, 0);
  assert.equal(errorCount, 0);
  assert.equal(exitCount, 1);
  assert.equal(probeCount, probeCountAtExit);

  processInstance.stop();
});

test("duplicate ready and error emission does not happen", async () => {
  let probeCount = 0;
  const { child, processInstance } = createProcessHarness({
    healthCheck: async () => {
      probeCount += 1;
      return true;
    },
  });

  let readyCount = 0;
  let errorCount = 0;
  processInstance.on("ready", () => {
    readyCount += 1;
  });
  processInstance.on("error", () => {
    errorCount += 1;
  });

  processInstance.start();
  await wait(20);
  child.stdout.emit("data", Buffer.from("[excelor-server] listening on http://localhost:27182\n"));
  await wait(20);

  assert.equal(readyCount, 1);
  assert.equal(errorCount, 0);
  assert.ok(probeCount >= 1);

  processInstance.stop();
});

test("probeExcelorHealth resolves true for a 200 response", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    const ok = await probeExcelorHealth(`http://127.0.0.1:${port}/health`, {
      requestTimeoutMs: 100,
    });
    assert.equal(ok, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
