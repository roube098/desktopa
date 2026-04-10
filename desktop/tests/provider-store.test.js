const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PROVIDER_STORE_PATH = path.resolve(__dirname, "../lib/provider-store.js");

function withTempHome(run) {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "provider-store-test-"));
  const previousEnv = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
  };

  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
  delete require.cache[PROVIDER_STORE_PATH];

  try {
    const providerStore = require(PROVIDER_STORE_PATH);
    return run(providerStore, tempHome);
  } finally {
    delete require.cache[PROVIDER_STORE_PATH];
    if (previousEnv.HOME === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousEnv.HOME;
    }
    if (previousEnv.USERPROFILE === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = previousEnv.USERPROFILE;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

test("zai metadata uses the coding API defaults", () => {
  withTempHome((providerStore) => {
    assert.equal(providerStore.PROVIDER_META.zai.baseUrl, "https://api.z.ai/api/coding/paas/v4");
    assert.equal(providerStore.PROVIDER_META.zai.defaultModelId, "glm-5.1");
    assert.deepEqual(providerStore.STATIC_MODELS.zai, [
      { id: "glm-5.1", name: "GLM-5.1" },
      { id: "glm-5", name: "GLM-5" },
      { id: "glm-4.7", name: "GLM-4.7" },
      { id: "glm-4.7-flash", name: "GLM-4.7 Flash" },
    ]);
  });
});

test("zai execution config is supported and normalized for Excelor", () => {
  withTempHome((providerStore) => {
    providerStore.addCustomModel("zai", "glm-custom", "GLM Custom");
    providerStore.storeApiKey("zai", "zai-test-key");
    providerStore.connectProvider("zai", {
      selectedModelId: "glm-5.1",
      availableModels: [{ id: "glm-4-plus", name: "GLM-4 Plus" }],
      baseUrl: "https://example.z.ai/v4",
    });
    providerStore.setActiveProvider("zai");

    const settings = providerStore.getProviderSettings();
    assert.equal(settings.connectedProviders.zai.excelorSupported, true);
    assert.deepEqual(
      settings.connectedProviders.zai.availableModels.map((model) => model.id),
      ["glm-5.1", "glm-5", "glm-4.7", "glm-4.7-flash", "glm-custom"],
    );

    const executionConfig = providerStore.getExcelorExecutionConfig();
    assert.equal(executionConfig.ok, true);
    assert.equal(executionConfig.providerId, "zai");
    assert.equal(executionConfig.modelId, "zai:glm-5.1");
    assert.equal(executionConfig.env.ZAI_API_KEY, "zai-test-key");
    assert.equal(executionConfig.env.ZAI_BASE_URL, "https://example.z.ai/v4");
  });
});

test("execution config names the required env var when the active provider key is missing", () => {
  withTempHome((providerStore) => {
    providerStore.connectProvider("openrouter", {
      selectedModelId: "stepfun/step-3.5-flash",
    });
    providerStore.setActiveProvider("openrouter");

    const executionConfig = providerStore.getExcelorExecutionConfig();
    assert.equal(executionConfig.ok, false);
    assert.match(executionConfig.error, /OPENROUTER_API_KEY/);
  });
});
