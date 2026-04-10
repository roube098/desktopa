/**
 * Provider Settings Store
 * 
 * JSON file-based storage for provider settings at ~/.excelor/provider-settings.json
 * Mirrors the openwork provider backend but simplified for the Excelor desktop app.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const http = require("http");

const STORE_DIR = path.join(os.homedir(), ".excelor");
const STORE_FILE = path.join(STORE_DIR, "provider-settings.json");
const CUSTOM_MODELS_FILE = path.join(STORE_DIR, "custom-models.json");
const ZAI_CODING_BASE_URL = "https://api.z.ai/api/coding/paas/v4";
const ZAI_MODELS_URL = `${ZAI_CODING_BASE_URL}/models`;

// ---------------------------------------------------------------------------
// Provider metadata (shared with frontend via IPC)
// ---------------------------------------------------------------------------

const PROVIDER_META = {
    openai: {
        id: "openai", name: "OpenAI", category: "classic",
        label: "Service", helpUrl: "https://platform.openai.com/api-keys",
        baseUrl: "https://api.openai.com/v1",
        modelsEndpoint: { url: "https://api.openai.com/v1/models", authStyle: "bearer" },
        defaultModelId: "gpt-5.2-codex",
    },
    anthropic: {
        id: "anthropic", name: "Anthropic", category: "classic",
        label: "Service", helpUrl: "https://console.anthropic.com/settings/keys",
        baseUrl: "https://api.anthropic.com",
        modelsEndpoint: null,
        defaultModelId: "claude-sonnet-4-20250514",
    },
    google: {
        id: "google", name: "Gemini", category: "classic",
        label: "Service", helpUrl: "https://aistudio.google.com/app/apikey",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        modelsEndpoint: null,
        defaultModelId: "gemini-2.5-pro",
    },
    xai: {
        id: "xai", name: "xAI", category: "classic",
        label: "Service", helpUrl: "https://x.ai/api",
        baseUrl: "https://api.x.ai/v1",
        modelsEndpoint: { url: "https://api.x.ai/v1/models", authStyle: "bearer" },
        defaultModelId: "grok-3",
    },
    deepseek: {
        id: "deepseek", name: "DeepSeek", category: "classic",
        label: "Service", helpUrl: "https://platform.deepseek.com/api_keys",
        baseUrl: "https://api.deepseek.com",
        modelsEndpoint: { url: "https://api.deepseek.com/models", authStyle: "bearer" },
        defaultModelId: "deepseek-chat",
    },
    moonshot: {
        id: "moonshot", name: "Moonshot AI", category: "classic",
        label: "Service", helpUrl: "https://platform.moonshot.ai/docs/guide/start-using-kimi-api",
        baseUrl: "https://api.moonshot.cn/v1",
        modelsEndpoint: null,
        defaultModelId: "moonshot-v1-128k",
    },
    zai: {
        id: "zai", name: "Z.AI", category: "classic",
        label: "Service", helpUrl: null,
        baseUrl: ZAI_CODING_BASE_URL,
        modelsEndpoint: null,
        defaultModelId: "glm-5.1",
    },
    minimax: {
        id: "minimax", name: "MiniMax", category: "classic",
        label: "Service", helpUrl: "https://platform.minimax.io/user-center/basic-information/interface-key",
        baseUrl: "https://api.minimax.chat/v1",
        modelsEndpoint: null,
        defaultModelId: "MiniMax-M2",
    },
    bedrock: {
        id: "bedrock", name: "AWS Bedrock", category: "aws",
        label: "Service", helpUrl: null,
        baseUrl: null,
        modelsEndpoint: null,
        defaultModelId: "anthropic.claude-opus-4-5-20251101-v1:0",
    },
    vertex: {
        id: "vertex", name: "Vertex AI", category: "gcp",
        label: "Service", helpUrl: null,
        baseUrl: null,
        modelsEndpoint: null,
        defaultModelId: null,
    },
    "azure-foundry": {
        id: "azure-foundry", name: "Azure AI Foundry", category: "azure",
        label: "Service", helpUrl: "https://ai.azure.com",
        baseUrl: null,
        modelsEndpoint: null,
        defaultModelId: null,
    },
    ollama: {
        id: "ollama", name: "Ollama", category: "local",
        label: "Local Models", helpUrl: null,
        baseUrl: "http://localhost:11434/v1",
        modelsEndpoint: { url: "http://localhost:11434/api/tags", authStyle: "none" },
        defaultModelId: null,
    },
    lmstudio: {
        id: "lmstudio", name: "LM Studio", category: "local",
        label: "Local Models", helpUrl: "https://lmstudio.ai/",
        baseUrl: "http://localhost:1234/v1",
        modelsEndpoint: { url: "http://localhost:1234/v1/models", authStyle: "none" },
        defaultModelId: null,
    },
    openrouter: {
        id: "openrouter", name: "OpenRouter", category: "proxy",
        label: "Gateway", helpUrl: "https://openrouter.ai/keys",
        baseUrl: "https://openrouter.ai/api/v1",
        modelsEndpoint: null,
        defaultModelId: "stepfun/step-3.5-flash",
    },
    litellm: {
        id: "litellm", name: "LiteLLM", category: "hybrid",
        label: "Service", helpUrl: null,
        baseUrl: "http://localhost:4000",
        modelsEndpoint: null,
        defaultModelId: null,
    },
};

const PROVIDER_ORDER = [
    "openai", "anthropic", "google", "deepseek", "xai", "moonshot",
    "zai", "minimax", "openrouter", "bedrock", "vertex", "azure-foundry",
    "ollama", "lmstudio", "litellm",
];

// Static model lists for providers without a models endpoint
const STATIC_MODELS = {
    openai: [
        { id: "gpt-5.2-codex", name: "GPT-5.2-Codex" },
    ],
    anthropic: [
        { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
        { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet" },
        { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
        { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
    ],
    google: [
        { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
        { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
        { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
    ],
    xai: [
        { id: "grok-3", name: "Grok 3" },
        { id: "grok-3-mini", name: "Grok 3 Mini" },
    ],
    deepseek: [
        { id: "deepseek-chat", name: "DeepSeek Chat" },
        { id: "deepseek-reasoner", name: "DeepSeek Reasoner" },
    ],
    moonshot: [
        { id: "moonshot-v1-8k", name: "Moonshot v1 8K" },
        { id: "moonshot-v1-32k", name: "Moonshot v1 32K" },
        { id: "moonshot-v1-128k", name: "Moonshot v1 128K" },
    ],
    zai: [
        { id: "glm-5.1", name: "GLM-5.1" },
        { id: "glm-5", name: "GLM-5" },
        { id: "glm-4.7", name: "GLM-4.7" },
        { id: "glm-4.7-flash", name: "GLM-4.7 Flash" },
    ],
    minimax: [
        { id: "MiniMax-M2", name: "MiniMax M2" },
        { id: "MiniMax-Text-01", name: "MiniMax Text 01" },
    ],
    bedrock: [
        { id: "anthropic.claude-opus-4-5-20251101-v1:0", name: "Claude Opus 4.5 (Bedrock)" },
        { id: "anthropic.claude-sonnet-4-20250514-v1:0", name: "Claude Sonnet 4 (Bedrock)" },
        { id: "anthropic.claude-3-5-haiku-20241022-v1:0", name: "Claude 3.5 Haiku (Bedrock)" },
    ],
    openrouter: [
        { id: "stepfun/step-3.5-flash", name: "Step-3.5-Flash" },
        { id: "qwen/qwen3.5-35b-a3b", name: "Qwen3.5-35B-A3B" },
        { id: "z-ai/glm-5", name: "GLM-5" },
        { id: "qwen/qwen3.5-plus-02-15", name: "Qwen3.5-Plus" },
    ],
};

const PROVIDERS_WITHOUT_STORED_KEYS = new Set([
    "ollama",
    "lmstudio",
    "bedrock",
    "vertex",
    "azure-foundry",
]);

const EXCELOR_SUPPORTED_PROVIDERS = new Set([
    "openai",
    "anthropic",
    "google",
    "xai",
    "deepseek",
    "moonshot",
    "zai",
    "openrouter",
    "ollama",
]);

function providerRequiresStoredKey(providerId) {
    return !PROVIDERS_WITHOUT_STORED_KEYS.has(providerId);
}

function getExcelorSupport(providerId) {
    if (EXCELOR_SUPPORTED_PROVIDERS.has(providerId)) {
        return {
            excelorSupported: true,
            excelorSupportReason: "",
        };
    }

    const providerName = PROVIDER_META[providerId]?.name || providerId;
    return {
        excelorSupported: false,
        excelorSupportReason: `Excelor does not support ${providerName} yet. Switch to a supported model in the composer or Settings.`,
    };
}

function getExcelorEnvName(providerId) {
    const envNames = {
        openai: "OPENAI_API_KEY",
        anthropic: "ANTHROPIC_API_KEY",
        google: "GOOGLE_API_KEY",
        xai: "XAI_API_KEY",
        deepseek: "DEEPSEEK_API_KEY",
        moonshot: "MOONSHOT_API_KEY",
        zai: "ZAI_API_KEY",
        openrouter: "OPENROUTER_API_KEY",
    };

    return envNames[providerId] || null;
}

function normalizeExcelorModelId(providerId, modelId) {
    if (!modelId) return null;

    if (providerId === "openrouter") {
        return modelId.startsWith("openrouter:") ? modelId : `openrouter:${modelId}`;
    }

    if (providerId === "ollama") {
        return modelId.startsWith("ollama:") ? modelId : `ollama:${modelId}`;
    }

    if (providerId === "zai") {
        return modelId.startsWith("zai:") ? modelId : `zai:${modelId}`;
    }

    return modelId;
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

function ensureStoreDir() {
    if (!fs.existsSync(STORE_DIR)) {
        fs.mkdirSync(STORE_DIR, { recursive: true });
    }
}

function readStore() {
    ensureStoreDir();
    try {
        if (fs.existsSync(STORE_FILE)) {
            const data = fs.readFileSync(STORE_FILE, "utf-8");
            return JSON.parse(data);
        }
    } catch (_) { }
    return { activeProviderId: null, connectedProviders: {}, debugMode: false };
}

function writeStore(data) {
    ensureStoreDir();
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Custom Models Storage
// ---------------------------------------------------------------------------

function readCustomModels() {
    ensureStoreDir();
    try {
        if (fs.existsSync(CUSTOM_MODELS_FILE)) {
            return JSON.parse(fs.readFileSync(CUSTOM_MODELS_FILE, "utf-8"));
        }
    } catch (_) { }
    return {};
}

function writeCustomModels(data) {
    ensureStoreDir();
    fs.writeFileSync(CUSTOM_MODELS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function getCustomModels(providerId) {
    const all = readCustomModels();
    return all[providerId] || [];
}

function addCustomModel(providerId, modelId, modelName) {
    const all = readCustomModels();
    if (!all[providerId]) all[providerId] = [];
    if (all[providerId].some(m => m.id === modelId)) return all[providerId];
    all[providerId].push({ id: modelId, name: modelName || modelId, custom: true });
    writeCustomModels(all);
    return all[providerId];
}

function removeCustomModel(providerId, modelId) {
    const all = readCustomModels();
    if (!all[providerId]) return [];
    all[providerId] = all[providerId].filter(m => m.id !== modelId);
    writeCustomModels(all);
    return all[providerId];
}

function getMergedModels(providerId) {
    const builtIn = STATIC_MODELS[providerId] || [];
    const custom = getCustomModels(providerId);
    const seen = new Set(builtIn.map(m => m.id));
    const merged = [...builtIn];
    for (const m of custom) {
        if (!seen.has(m.id)) {
            merged.push({ ...m, custom: true });
            seen.add(m.id);
        }
    }
    return merged;
}

// ---------------------------------------------------------------------------
// API Key Vault (persisted with basic encoding to survive restarts)
// ---------------------------------------------------------------------------

const KEYS_FILE = path.join(STORE_DIR, ".api-keys");

const apiKeyVault = {};

function _encode(str) { return Buffer.from(str).toString("base64"); }
function _decode(str) { return Buffer.from(str, "base64").toString("utf-8"); }

function _persistKeys() {
    ensureStoreDir();
    const encoded = {};
    for (const [k, v] of Object.entries(apiKeyVault)) {
        if (v) encoded[k] = _encode(v);
    }
    fs.writeFileSync(KEYS_FILE, JSON.stringify(encoded, null, 2), "utf-8");
}

function _loadPersistedKeys() {
    try {
        if (fs.existsSync(KEYS_FILE)) {
            const data = JSON.parse(fs.readFileSync(KEYS_FILE, "utf-8"));
            for (const [k, v] of Object.entries(data)) {
                if (v && !apiKeyVault[k]) apiKeyVault[k] = _decode(v);
            }
        }
    } catch (_) { }
}

_loadPersistedKeys();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function getProviderSettings() {
    const store = readStore();
    const connectedProviders = {};
    const providersWithMergedModels = new Set(["openai", "openrouter", "zai"]);

    for (const [providerId, provider] of Object.entries(store.connectedProviders || {})) {
        const normalizedAvailableModels = providersWithMergedModels.has(providerId)
            ? getMergedModels(providerId)
            : provider.availableModels;

        connectedProviders[providerId] = {
            ...provider,
            availableModels: normalizedAvailableModels,
            hasStoredKey: providerRequiresStoredKey(providerId) ? Boolean(apiKeyVault[providerId]) : true,
            ...getExcelorSupport(providerId),
        };
    }

    return {
        ...store,
        connectedProviders,
    };
}

function setActiveProvider(providerId) {
    const store = readStore();
    store.activeProviderId = providerId;
    writeStore(store);
    return getProviderSettings();
}

function connectProvider(providerId, providerData) {
    const store = readStore();
    store.connectedProviders[providerId] = {
        providerId,
        connectionStatus: "connected",
        selectedModelId: providerData.selectedModelId || null,
        credentials: providerData.credentials || { type: "api_key", keyPrefix: "" },
        baseUrl: providerData.baseUrl || null,
        lastConnectedAt: new Date().toISOString(),
        availableModels: providerData.availableModels || STATIC_MODELS[providerId] || [],
    };
    writeStore(store);

    if (providerData.fullApiKey) {
        apiKeyVault[providerId] = providerData.fullApiKey;
        _persistKeys();
    }

    return getProviderSettings();
}

function disconnectProvider(providerId) {
    const store = readStore();
    delete store.connectedProviders[providerId];
    delete apiKeyVault[providerId];
    _persistKeys();
    if (store.activeProviderId === providerId) {
        const nextReady = Object.values(store.connectedProviders).find(
            p => p.connectionStatus === "connected" && p.selectedModelId
        );
        store.activeProviderId = nextReady ? nextReady.providerId : null;
    }
    writeStore(store);
    return getProviderSettings();
}

function updateProviderModel(providerId, modelId) {
    const store = readStore();
    if (store.connectedProviders[providerId]) {
        store.connectedProviders[providerId].selectedModelId = modelId;
        writeStore(store);
    }
    return getProviderSettings();
}

function getApiKey(providerId) {
    return apiKeyVault[providerId] || null;
}

function storeApiKey(providerId, apiKey) {
    apiKeyVault[providerId] = apiKey;
    _persistKeys();
}

// ---------------------------------------------------------------------------
// API Key Validation
// ---------------------------------------------------------------------------

function httpRequest(url, options) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith("https") ? https : http;
        const req = lib.request(url, options, (res) => {
            let body = "";
            res.on("data", chunk => (body += chunk));
            res.on("end", () => resolve({ status: res.statusCode, body }));
        });
        req.on("error", reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error("Timeout")); });
        req.end();
    });
}

async function validateApiKey(providerId, apiKey) {
    const meta = PROVIDER_META[providerId];
    if (!meta) return { valid: false, error: "Unknown provider" };

    try {
        let result;

        // Local providers don't need API key validation
        if (meta.category === "local") {
            return { valid: true };
        }

        if (providerId === "anthropic") {
            result = await httpRequest("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                    "x-api-key": apiKey,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
            });
            if (result.status === 401) return { valid: false, error: "Invalid API key" };
            return { valid: true };
        }

        if (providerId === "google") {
            result = await httpRequest(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
                { method: "GET" }
            );
            if (result.status === 401 || result.status === 403) return { valid: false, error: "Invalid API key" };
            return { valid: true };
        }

        if (providerId === "zai") {
            result = await httpRequest(ZAI_MODELS_URL, {
                method: "GET",
                headers: { Authorization: `Bearer ${apiKey}` },
            });
            if (result.status === 401 || result.status === 403) return { valid: false, error: "Invalid API key" };
            return { valid: true };
        }

        if (providerId === "moonshot") {
            result = await httpRequest("https://api.moonshot.cn/v1/models", {
                method: "GET",
                headers: { Authorization: `Bearer ${apiKey}` },
            });
            if (result.status === 401 || result.status === 403) return { valid: false, error: "Invalid API key" };
            return { valid: true };
        }

        if (providerId === "minimax") {
            result = await httpRequest("https://api.minimax.chat/v1/models", {
                method: "GET",
                headers: { Authorization: `Bearer ${apiKey}` },
            });
            if (result.status === 401 || result.status === 403) return { valid: false, error: "Invalid API key" };
            return { valid: true };
        }

        // AWS/GCP/Azure — skip validation, trust user
        if (["bedrock", "vertex", "azure-foundry"].includes(providerId)) {
            return { valid: true };
        }

        // OpenAI-compatible providers (openai, xai, deepseek, openrouter, litellm)
        const modelsUrl = meta.modelsEndpoint?.url || `${meta.baseUrl}/models`;
        result = await httpRequest(modelsUrl, {
            method: "GET",
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (result.status === 401 || result.status === 403) return { valid: false, error: "Invalid API key" };
        return { valid: true };
    } catch (err) {
        return { valid: false, error: err.message || "Validation failed" };
    }
}

async function fetchProviderModels(providerId, apiKey) {
    const meta = PROVIDER_META[providerId];
    if (!meta) return { success: false, models: getMergedModels(providerId) };

    if (providerId === "openai") {
        return { success: true, models: getMergedModels(providerId) };
    }

    if (!meta.modelsEndpoint) {
        return { success: true, models: getMergedModels(providerId) };
    }

    const key = apiKey || apiKeyVault[providerId];

    try {
        const headers = {};
        if (meta.modelsEndpoint.authStyle === "bearer" && key) {
            headers.Authorization = `Bearer ${key}`;
        }

        const result = await httpRequest(meta.modelsEndpoint.url, {
            method: "GET",
            headers,
        });

        if (result.status === 200) {
            const data = JSON.parse(result.body);

            if (providerId === "ollama" && data.models) {
                const models = data.models.map(m => ({ id: m.name, name: m.name }));
                if (models.length > 0) {
                    const custom = getCustomModels(providerId);
                    return { success: true, models: [...models, ...custom.filter(c => !models.some(m => m.id === c.id))] };
                }
            }

            if (data.data && Array.isArray(data.data)) {
                const models = data.data
                    .filter(m => m.id)
                    .map(m => ({ id: m.id, name: m.id }))
                    .slice(0, 50);
                if (models.length > 0) {
                    const custom = getCustomModels(providerId);
                    return { success: true, models: [...models, ...custom.filter(c => !models.some(m => m.id === c.id))] };
                }
            }
        }
    } catch (_) { }

    return { success: true, models: getMergedModels(providerId) };
}

/**
 * Get the active provider's config for making API calls.
 * Returns { apiKey, baseUrl, model } or null.
 */
function getActiveProviderConfig() {
    const store = readStore();
    if (!store.activeProviderId) return null;

    const provider = store.connectedProviders[store.activeProviderId];
    if (!provider || provider.connectionStatus !== "connected") return null;

    const meta = PROVIDER_META[store.activeProviderId];
    const apiKey = apiKeyVault[store.activeProviderId];
    const modelId = provider.selectedModelId || meta?.defaultModelId || null;

    if (providerRequiresStoredKey(store.activeProviderId) && !apiKey) {
        return null;
    }

    if (!modelId) {
        return null;
    }

    return {
        providerId: store.activeProviderId,
        apiKey: apiKey || null,
        baseUrl: provider.baseUrl || meta?.baseUrl || null,
        modelId,
    };
}

function getExcelorExecutionConfig() {
    const store = readStore();
    const activeProviderId = store.activeProviderId;

    if (!activeProviderId) {
        return {
            ok: false,
            error: "No active provider is configured. Choose a supported model in the composer or Settings.",
        };
    }

    const provider = store.connectedProviders[activeProviderId];
    if (!provider || provider.connectionStatus !== "connected") {
        return {
            ok: false,
            error: "The active provider is not connected. Reconnect it in Settings and try again.",
        };
    }

    const support = getExcelorSupport(activeProviderId);
    if (!support.excelorSupported) {
        return {
            ok: false,
            error: support.excelorSupportReason,
        };
    }

    const meta = PROVIDER_META[activeProviderId];
    const modelId = provider.selectedModelId || meta?.defaultModelId || null;
    if (!modelId) {
        return {
            ok: false,
            error: "The active provider does not have a model selected. Choose a model in the composer or Settings.",
        };
    }

    const env = {};
    const envName = getExcelorEnvName(activeProviderId);
    const apiKey = apiKeyVault[activeProviderId] || null;

    if (envName) {
        if (!apiKey) {
            if (provider.credentials?.oauthProvider === "chatgpt") {
                return {
                    ok: false,
                    error: `Excelor requires ${envName}. ChatGPT sign-in is not supported for Excelor runs.`,
                };
            }

            return {
                ok: false,
                error: `Excelor requires ${envName} for ${meta?.name || activeProviderId}. Reconnect the provider in Settings and try again.`,
            };
        }

        env[envName] = apiKey;
    }

    if (activeProviderId === "ollama") {
        const serverUrl = provider.credentials?.serverUrl || provider.baseUrl || "http://localhost:11434";
        env.OLLAMA_BASE_URL = serverUrl;
    }

    if (activeProviderId === "zai") {
        env.ZAI_BASE_URL = provider.baseUrl || meta?.baseUrl || ZAI_CODING_BASE_URL;
    }

    return {
        ok: true,
        providerId: activeProviderId,
        modelId: normalizeExcelorModelId(activeProviderId, modelId),
        env,
    };
}

// ---------------------------------------------------------------------------
// Local Provider Testing
// ---------------------------------------------------------------------------

async function testOllamaConnection(url) {
    try {
        const result = await httpRequest(`${url}/api/tags`, { method: "GET" });
        if (result.status !== 200) {
            return { success: false, error: `Ollama returned status ${result.status}` };
        }

        const data = JSON.parse(result.body);
        const rawModels = data.models || [];
        const models = rawModels.map(m => ({
            id: m.name,
            displayName: m.name,
            size: m.size,
            toolSupport: 'unknown' // Simplified for desktop version
        }));

        return { success: true, models };
    } catch (err) {
        return { success: false, error: "Cannot connect to Ollama: " + (err.message || "Connection failed") };
    }
}

async function testLMStudioConnection(url) {
    try {
        const result = await httpRequest(`${url}/v1/models`, { method: "GET" });
        if (result.status !== 200) {
            return { success: false, error: `LM Studio returned status ${result.status}` };
        }

        const data = JSON.parse(result.body);
        const rawModels = data.data || [];
        const models = rawModels.map(m => ({
            id: m.id,
            name: m.id,
            toolSupport: 'unknown' // Simplified for desktop version
        }));

        return { success: true, models };
    } catch (err) {
        return { success: false, error: "Cannot connect to LM Studio: " + (err.message || "Connection failed") };
    }
}

module.exports = {
    PROVIDER_META,
    PROVIDER_ORDER,
    STATIC_MODELS,
    getProviderSettings,
    setActiveProvider,
    connectProvider,
    disconnectProvider,
    updateProviderModel,
    getApiKey,
    storeApiKey,
    validateApiKey,
    fetchProviderModels,
    getActiveProviderConfig,
    getExcelorExecutionConfig,
    testOllamaConnection,
    testLMStudioConnection,
    getCustomModels,
    addCustomModel,
    removeCustomModel,
    getMergedModels,
};
