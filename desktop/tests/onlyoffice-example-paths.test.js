const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  isIpv4Address,
  parseGatewayIps,
  mergeClientDirectoryNames,
  findFirstTemplatePath,
  findFirstExistingFilePath,
} = require("../lib/onlyoffice-example-paths");

test("isIpv4Address validates IPv4 values", () => {
  assert.equal(isIpv4Address("172.20.0.1"), true);
  assert.equal(isIpv4Address("255.255.255.255"), true);
  assert.equal(isIpv4Address("300.1.1.1"), false);
  assert.equal(isIpv4Address("abc"), false);
});

test("parseGatewayIps returns unique valid gateway IPs", () => {
  const result = parseGatewayIps("172.20.0.1 172.20.0.1 invalid 172.19.0.1\n");
  assert.deepEqual(result, ["172.20.0.1", "172.19.0.1"]);
});

test("mergeClientDirectoryNames orders gateways, discovered, then legacy fallback", () => {
  const result = mergeClientDirectoryNames({
    gatewayIps: ["172.20.0.1", "172.19.0.1"],
    discoveredDirNames: ["172.19.0.1", "172.21.0.1", "bad"],
    legacyDirName: "172.19.0.1",
  });

  assert.deepEqual(result, ["172.20.0.1", "172.19.0.1", "172.21.0.1"]);
});

test("findFirstTemplatePath searches across multiple client directories", () => {
  const dirs = [
    path.join("C:", "onlyoffice", "files", "172.20.0.1"),
    path.join("C:", "onlyoffice", "files", "172.19.0.1"),
  ];
  const fsMock = {
    existsSync: (candidate) => candidate.endsWith(path.join("172.19.0.1", "new.pptx")),
    readdirSync: () => [],
  };

  const template = findFirstTemplatePath("pptx", dirs, fsMock);
  assert.equal(template, path.join("C:", "onlyoffice", "files", "172.19.0.1", "new.pptx"));
});

test("findFirstExistingFilePath searches each client directory", () => {
  const dirs = [
    path.join("C:", "onlyoffice", "files", "172.20.0.1"),
    path.join("C:", "onlyoffice", "files", "172.19.0.1"),
  ];
  const fsMock = {
    existsSync: (candidate) => candidate.endsWith(path.join("172.19.0.1", "Book1.xlsx")),
  };

  const found = findFirstExistingFilePath("Book1.xlsx", dirs, fsMock);
  assert.equal(found, path.join("C:", "onlyoffice", "files", "172.19.0.1", "Book1.xlsx"));
});

