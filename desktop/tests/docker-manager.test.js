const test = require("node:test");
const assert = require("node:assert/strict");

const DockerManager = require("../lib/docker-manager");

test("_ensureOnlyOfficeExampleReady returns immediately when the example endpoint is already healthy", async () => {
  const manager = new DockerManager("C:\\test");
  manager._sleep = async () => {};

  let readyChecks = 0;
  let statusChecks = 0;
  let startCalls = 0;

  manager._isOnlyOfficeExampleReady = async () => {
    readyChecks += 1;
    return true;
  };
  manager._getOnlyOfficeExampleStatus = async () => {
    statusChecks += 1;
    return "ds:example RUNNING";
  };
  manager._startOnlyOfficeExample = async () => {
    startCalls += 1;
  };

  const result = await manager._ensureOnlyOfficeExampleReady();

  assert.equal(result, true);
  assert.equal(readyChecks, 1);
  assert.equal(statusChecks, 0);
  assert.equal(startCalls, 0);
});

test("_ensureOnlyOfficeExampleReady starts ds:example and waits for the endpoint", async () => {
  const manager = new DockerManager("C:\\test");
  manager._sleep = async () => {};

  let readyChecks = 0;
  let statusChecks = 0;
  let startCalls = 0;

  manager._isOnlyOfficeExampleReady = async () => {
    readyChecks += 1;
    return readyChecks >= 3;
  };
  manager._getOnlyOfficeExampleStatus = async () => {
    statusChecks += 1;
    return "ds:example STOPPED   Not started";
  };
  manager._startOnlyOfficeExample = async () => {
    startCalls += 1;
  };

  const result = await manager._ensureOnlyOfficeExampleReady();

  assert.equal(result, true);
  assert.equal(statusChecks, 1);
  assert.equal(startCalls, 1);
  assert.equal(readyChecks, 3);
});

test("_performHealthCheck emits ready only after backend, OnlyOffice, and the example app are all healthy", async () => {
  const manager = new DockerManager("C:\\test");
  manager.ports = { backend: 8090, onlyoffice: 8080 };

  const emitted = [];
  manager.on("ready", () => emitted.push("ready"));

  manager._httpCheck = async (url) => {
    if (url.includes("/api/health")) return true;
    if (url.includes("/healthcheck")) return true;
    throw new Error(`Unexpected URL: ${url}`);
  };
  manager._ensureOnlyOfficeExampleReady = async () => true;

  await manager._performHealthCheck({ emitted: false });

  assert.deepEqual(manager.getStatus(), { backend: "ready", onlyoffice: "ready" });
  assert.deepEqual(emitted, ["ready"]);
});
