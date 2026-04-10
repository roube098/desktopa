const fs = require("fs");
const os = require("os");
const path = require("path");
const { discoverConnector } = require("./mcp-connector-client");
const BUILTIN_MCP_CONNECTOR_CATALOG = require("../../shared/builtin-mcp-connectors.json");

const STORE_DIR = path.join(os.homedir(), ".excelor");
const STORE_FILE = path.join(STORE_DIR, "runtime-config.json");
const DEFAULT_WORKSPACE_DIR = path.join(os.homedir(), "Documents", "My Workspace");
const BUILTIN_MCP_CONNECTORS = Object.freeze(
  Array.isArray(BUILTIN_MCP_CONNECTOR_CATALOG)
    ? BUILTIN_MCP_CONNECTOR_CATALOG.map((entry) => Object.freeze({ ...entry }))
    : [],
);

const FINANCIAL_MCP_CATALOG = Object.freeze({
  fmp: {
    id: "fmp",
    name: "Financial Modeling Prep",
    label: "API Key",
    urlTemplate: "https://financialmodelingprep.com/mcp?apikey={KEY}",
    authType: "api-key",
    color: "#0d6efd",
    helpUrl: "https://financialmodelingprep.com/developer/docs",
    notes: "Replace {KEY} with your FMP API key (free tier available).",
  },
  alphavantage: {
    id: "alphavantage",
    name: "Alpha Vantage",
    label: "API Key",
    urlTemplate: "https://mcp.alphavantage.co/mcp?apikey={KEY}",
    authType: "api-key",
    color: "#7c3aed",
    helpUrl: "https://www.alphavantage.co/support/#api-key",
    notes: "Official hosted MCP endpoint with API key in URL.",
  },
  marketxls: {
    id: "marketxls",
    name: "MarketXLS",
    label: "OAuth",
    urlTemplate: "https://mcp.marketxls.com/mcp",
    authType: "oauth",
    color: "#059669",
    helpUrl: "https://marketxls.com/",
    notes: "Requires MarketXLS login after connection check.",
  },
  financialdatasets_mcp: {
    id: "financialdatasets_mcp",
    name: "Financial Datasets",
    label: "OAuth",
    urlTemplate: "https://mcp.financialdatasets.ai/",
    authType: "oauth",
    color: "#ea580c",
    helpUrl: "https://financialdatasets.ai/",
    notes: "OAuth login is triggered on first connection.",
  },
  factset: {
    id: "factset",
    name: "FactSet",
    label: "SSO",
    urlTemplate: "https://mcp.factset.com/content/v1",
    authType: "sso",
    color: "#dc2626",
    helpUrl: "https://www.factset.com/",
    notes: "Enterprise SSO login required after connect.",
  },
});

const DEFAULT_FINANCIAL_MCP_PROVIDERS = Object.freeze({
  fmp: { enabled: false, apiKey: "", connectorId: null },
  alphavantage: { enabled: false, apiKey: "", connectorId: null },
  marketxls: { enabled: false, connectorId: null },
  financialdatasets_mcp: { enabled: false, connectorId: null },
  factset: { enabled: false, connectorId: null },
});

const DEFAULT_CONFIG = {
  version: 1,
  models: {
    customModel: "",
    baseUrl: "",
    temperature: 0.1,
    reasoningEffort: "medium",
  },
  runtime: {
    collaborationMode: "Default",
    approvalPolicy: "on-request",
    sandboxMode: "workspace-write",
    webSearchMode: "manual",
    personality: "codex-desktop",
    defaultWorkingDirectory: DEFAULT_WORKSPACE_DIR,
  },
  skills: {
    entries: {},
  },
  commands: {
    entries: {},
  },
  agents: {
    builtins: {
      orchestrator: true,
      spreadsheet: true,
      document: true,
      presentation: true,
      pdf: true,
      workspace: true,
      research: true,
      review: true,
      planner: true,
    },
    custom: [],
  },
  features: {
    web: true,
    mcp: false,
    apps: false,
    plugins: true,
    memories: true,
    dynamicTools: true,
    requestUserInput: true,
    unifiedExec: true,
  },
  mcp: {
    servers: [],
    connectors: [],
  },
  apps: {
    connectors: [],
  },
  plugins: {
    enabled: true,
    entries: {},
    externalPaths: [],
  },
  externalConfig: {
    importedPaths: [],
    importedAgents: [],
    detectedPaths: [],
    lastDetectedAt: null,
    lastImportedAt: null,
  },
  memories: {
    enabled: true,
    maxSummaries: 20,
  },
  financial: {
    dataProvider: "financialdatasets",
    apiKeys: {
      financialdatasets: "",
      exa: "",
      tavily: "",
    },
    mcpProviders: deepClone(DEFAULT_FINANCIAL_MCP_PROVIDERS),
  },
};

function ensureStoreDir() {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(baseValue, patchValue) {
  if (patchValue === undefined) {
    return deepClone(baseValue);
  }

  if (Array.isArray(baseValue) || Array.isArray(patchValue)) {
    return deepClone(patchValue);
  }

  if (!isPlainObject(baseValue) || !isPlainObject(patchValue)) {
    return deepClone(patchValue);
  }

  const result = { ...baseValue };

  for (const [key, value] of Object.entries(patchValue)) {
    result[key] = key in baseValue
      ? deepMerge(baseValue[key], value)
      : deepClone(value);
  }

  return result;
}

function readRawConfig() {
  ensureStoreDir();

  if (!fs.existsSync(STORE_FILE)) {
    return deepClone(DEFAULT_CONFIG);
  }

  try {
    const raw = fs.readFileSync(STORE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return deepMerge(DEFAULT_CONFIG, parsed);
  } catch (error) {
    console.error("[runtime-config-store] Failed to read runtime config:", error);
    return deepClone(DEFAULT_CONFIG);
  }
}

function writeRawConfig(nextConfig) {
  ensureStoreDir();
  fs.writeFileSync(STORE_FILE, JSON.stringify(nextConfig, null, 2), "utf-8");
}

function getConfig() {
  return readRawConfig();
}

function updateConfig(partialConfig) {
  const current = readRawConfig();
  const next = deepMerge(current, partialConfig);
  writeRawConfig(next);
  return next;
}

function getFinancialSettings() {
  const current = readRawConfig();
  const fallback = DEFAULT_CONFIG.financial;
  if (!current || !current.financial) {
    return deepClone(fallback);
  }
  return deepMerge(fallback, current.financial);
}

function updateFinancialSettings(partialFinancialConfig) {
  const current = readRawConfig();
  const existing = (current && current.financial) ? current.financial : DEFAULT_CONFIG.financial;
  const nextFinancial = deepMerge(existing, partialFinancialConfig || {});
  const nextConfig = {
    ...current,
    financial: nextFinancial,
  };
  writeRawConfig(nextConfig);
  return nextFinancial;
}

function getFinancialMcpCatalog() {
  return Object.values(FINANCIAL_MCP_CATALOG).map((entry) => ({ ...entry }));
}

function getFinancialMcpProviderConfig() {
  const financial = getFinancialSettings();
  return deepMerge(DEFAULT_FINANCIAL_MCP_PROVIDERS, financial?.mcpProviders || {});
}

function resolveFinancialMcpUrl(providerId, state) {
  const meta = FINANCIAL_MCP_CATALOG[providerId];
  if (!meta) {
    throw new Error(`Unknown financial MCP provider: ${providerId}`);
  }

  if (meta.authType === "api-key") {
    const key = String(state?.apiKey || "").trim();
    if (!key) {
      return null;
    }
    return meta.urlTemplate.replace("{KEY}", encodeURIComponent(key));
  }

  return meta.urlTemplate;
}

function getFinancialMcpProviderStates() {
  const providers = getFinancialMcpProviderConfig();
  const connectors = getMcpConnectors();
  const byId = new Map(connectors.map((connector) => [connector.id, connector]));
  const byFinancialProvider = new Map(
    connectors
      .filter((connector) => connector.financialProviderId)
      .map((connector) => [connector.financialProviderId, connector]),
  );

  const states = {};
  for (const providerId of Object.keys(DEFAULT_FINANCIAL_MCP_PROVIDERS)) {
    const state = providers[providerId] || {};
    const connector =
      (state.connectorId && byId.get(state.connectorId)) ||
      byFinancialProvider.get(providerId) ||
      null;
    const resolvedUrl = resolveFinancialMcpUrl(providerId, state);

    states[providerId] = {
      providerId,
      enabled: Boolean(state.enabled),
      apiKey: state.apiKey || "",
      connectorId: connector?.id || null,
      connectorStatus: connector?.status || "disconnected",
      mcpUrl: resolvedUrl || undefined,
    };
  }

  return states;
}

function getFinancialMcpProviders() {
  return {
    catalog: getFinancialMcpCatalog(),
    states: getFinancialMcpProviderStates(),
  };
}

function getMcpConnectors() {
  const connectors = mergeBuiltinMcpConnectors(getStoredMcpConnectors());
  return connectors.sort(sortMcpConnectors);
}

function getStoredMcpConnectors() {
  const current = readRawConfig();
  const connectors = Array.isArray(current.mcp?.connectors) ? current.mcp.connectors : [];
  return connectors.map((connector) => ({
    ...connector,
    discovery: connector?.discovery ? deepClone(connector.discovery) : undefined,
  }));
}

function mergeBuiltinMcpConnectors(connectors) {
  const byId = new Map(connectors.map((connector) => [connector.id, connector]));
  const builtins = BUILTIN_MCP_CONNECTORS.map((builtin) => {
    const override = byId.get(builtin.id) || {};
    return {
      ...deepClone(builtin),
      ...override,
      id: builtin.id,
      name: builtin.name,
      title: builtin.title,
      description: builtin.description,
      url: builtin.url,
      status: typeof override.status === "string" ? override.status : builtin.status || "disconnected",
      isEnabled: override.isEnabled !== false,
      isBuiltIn: true,
      builtInAppId: builtin.builtInAppId,
      builtInKind: builtin.builtInKind,
      autoOpenOnExec: builtin.autoOpenOnExec,
      resourceUri: builtin.resourceUri,
      discovery: override.discovery ? deepClone(override.discovery) : undefined,
    };
  });

  const builtinIds = new Set(BUILTIN_MCP_CONNECTORS.map((connector) => connector.id));
  const customConnectors = connectors
    .filter((connector) => !builtinIds.has(connector.id))
    .map((connector) => ({ ...connector }));

  return [...builtins, ...customConnectors];
}

function sortMcpConnectors(left, right) {
  if (Boolean(left.isBuiltIn) !== Boolean(right.isBuiltIn)) {
    return left.isBuiltIn ? -1 : 1;
  }

  const leftTimestamp = String(left.updatedAt || left.createdAt || "");
  const rightTimestamp = String(right.updatedAt || right.createdAt || "");
  return rightTimestamp.localeCompare(leftTimestamp);
}

function writeMcpConnectors(connectors) {
  const current = readRawConfig();
  current.mcp = {
    ...(current.mcp || {}),
    connectors,
  };
  current.features = {
    ...(current.features || {}),
    mcp: connectors.some((connector) => connector.isEnabled !== false),
  };
  writeRawConfig(current);
  return connectors;
}

function assertConnectorUrl(rawUrl) {
  const trimmedUrl = String(rawUrl || "").trim();
  let parsed;
  try {
    parsed = new URL(trimmedUrl);
  } catch (error) {
    throw new Error("Please enter a valid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URL must start with http:// or https://");
  }

  return trimmedUrl;
}

function addMcpConnector(name, url) {
  const trimmedUrl = assertConnectorUrl(url);
  const trimmedName = String(name || "").trim() || "MCP Server";
  const connectors = getMcpConnectors();
  const now = new Date().toISOString();

  const connector = {
    id: `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: trimmedName.slice(0, 128),
    url: trimmedUrl,
    status: "disconnected",
    isEnabled: true,
    createdAt: now,
    updatedAt: now,
  };

  writeMcpConnectors([connector, ...connectors]);
  return connector;
}

function upsertFinancialMcpConnector(connectors, providerId, url) {
  const meta = FINANCIAL_MCP_CATALOG[providerId];
  const now = new Date().toISOString();
  const existingIndex = connectors.findIndex(
    (entry) =>
      entry.financialProviderId === providerId ||
      entry.id === getFinancialMcpProviderConfig()?.[providerId]?.connectorId ||
      (entry.source === "financial-mcp" && entry.url === url),
  );

  if (existingIndex >= 0) {
    const existing = connectors[existingIndex];
    const updated = {
      ...existing,
      name: meta.name,
      url,
      source: "financial-mcp",
      financialProviderId: providerId,
      isEnabled: true,
      updatedAt: now,
    };
    connectors[existingIndex] = updated;
    return updated;
  }

  const created = {
    id: `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: meta.name,
    url,
    status: "disconnected",
    isEnabled: true,
    createdAt: now,
    updatedAt: now,
    source: "financial-mcp",
    financialProviderId: providerId,
  };
  connectors.unshift(created);
  return created;
}

function removeFinancialMcpConnector(connectors, providerId, connectorId) {
  return connectors.filter(
    (entry) =>
      entry.id !== connectorId &&
      entry.financialProviderId !== providerId &&
      !(entry.source === "financial-mcp" && entry.financialProviderId === providerId),
  );
}

function writeFinancialMcpProviderConfig(nextProviders) {
  const current = readRawConfig();
  const nextFinancial = deepMerge(DEFAULT_CONFIG.financial, current.financial || {});
  nextFinancial.mcpProviders = deepMerge(DEFAULT_FINANCIAL_MCP_PROVIDERS, nextProviders || {});
  current.financial = nextFinancial;
  writeRawConfig(current);
  return nextFinancial.mcpProviders;
}

function syncFinancialMcpProviders() {
  const providerConfig = getFinancialMcpProviderConfig();
  let connectors = getMcpConnectors();
  const nextProviderConfig = deepMerge(DEFAULT_FINANCIAL_MCP_PROVIDERS, providerConfig);

  for (const providerId of Object.keys(DEFAULT_FINANCIAL_MCP_PROVIDERS)) {
    const state = nextProviderConfig[providerId] || {};
    const resolvedUrl = resolveFinancialMcpUrl(providerId, state);
    const shouldEnable = Boolean(state.enabled) && Boolean(resolvedUrl);

    if (shouldEnable) {
      const connector = upsertFinancialMcpConnector(connectors, providerId, resolvedUrl);
      nextProviderConfig[providerId] = {
        ...state,
        enabled: true,
        connectorId: connector.id,
      };
      continue;
    }

    connectors = removeFinancialMcpConnector(connectors, providerId, state.connectorId);
    nextProviderConfig[providerId] = {
      ...state,
      enabled: false,
      connectorId: null,
    };
  }

  writeMcpConnectors(connectors);
  writeFinancialMcpProviderConfig(nextProviderConfig);
  return getFinancialMcpProviders();
}

function deleteMcpConnector(connectorId) {
  const connector = getMcpConnectors().find((entry) => entry.id === connectorId);
  if (connector?.isBuiltIn) {
    throw new Error("Built-in connectors cannot be deleted");
  }
  const connectors = getMcpConnectors().filter((connector) => connector.id !== connectorId);
  writeMcpConnectors(connectors);
  return connectors;
}

function setMcpConnectorEnabled(connectorId, enabled) {
  const connectors = getMcpConnectors().map((connector) =>
    connector.id === connectorId
      ? {
          ...connector,
          isEnabled: Boolean(enabled),
          updatedAt: new Date().toISOString(),
        }
      : connector,
  );
  writeMcpConnectors(connectors);
  return connectors.find((connector) => connector.id === connectorId) || null;
}

async function checkMcpConnector(connectorId) {
  const connectors = getMcpConnectors();
  const connector = connectors.find((entry) => entry.id === connectorId);
  if (!connector) {
    throw new Error("Connector not found");
  }

  try {
    const discovery = await discoverConnector(connector.url);

    const checkedAt = new Date().toISOString();
    const updatedConnector = {
      ...connector,
      status: "connected",
      lastConnectedAt: checkedAt,
      updatedAt: checkedAt,
      discovery,
    };

    writeMcpConnectors(
      connectors.map((entry) => (entry.id === connectorId ? updatedConnector : entry)),
    );

    return updatedConnector;
  } catch (error) {
    const failedAt = new Date().toISOString();
    const failedConnector = {
      ...connector,
      status: "error",
      updatedAt: failedAt,
    };
    writeMcpConnectors(
      connectors.map((entry) => (entry.id === connectorId ? failedConnector : entry)),
    );
    throw error;
  }
}

async function checkFinancialMcpProvider(providerId) {
  const providerStates = getFinancialMcpProviderStates();
  const state = providerStates[providerId];
  if (!state) {
    throw new Error("Financial MCP provider not found");
  }
  if (!state.enabled) {
    throw new Error("Enable this provider before checking connection");
  }
  if (!state.connectorId) {
    syncFinancialMcpProviders();
  }

  const refreshedState = getFinancialMcpProviderStates()[providerId];
  if (!refreshedState?.connectorId) {
    throw new Error("Connector could not be created for this provider");
  }

  await checkMcpConnector(refreshedState.connectorId);
  return getFinancialMcpProviderStates()[providerId];
}

function connectFinancialMcpProvider(providerId, apiKey) {
  const meta = FINANCIAL_MCP_CATALOG[providerId];
  if (!meta) {
    throw new Error("Unknown financial MCP provider");
  }

  const current = getFinancialMcpProviderConfig();
  const next = deepMerge(DEFAULT_FINANCIAL_MCP_PROVIDERS, current);
  const existing = next[providerId] || {};
  const normalizedApiKey = typeof apiKey === "string" ? apiKey.trim() : undefined;

  if (meta.authType === "api-key" && !normalizedApiKey && !existing.apiKey) {
    throw new Error("API key is required for this provider");
  }

  next[providerId] = {
    ...existing,
    enabled: true,
    ...(normalizedApiKey !== undefined ? { apiKey: normalizedApiKey } : {}),
  };

  writeFinancialMcpProviderConfig(next);
  syncFinancialMcpProviders();
  return getFinancialMcpProviderStates()[providerId];
}

function disconnectFinancialMcpProvider(providerId) {
  const current = getFinancialMcpProviderConfig();
  const existing = current[providerId];
  if (!existing) {
    return { success: true };
  }

  let connectors = getMcpConnectors();
  connectors = removeFinancialMcpConnector(connectors, providerId, existing.connectorId);
  writeMcpConnectors(connectors);

  const next = deepMerge(DEFAULT_FINANCIAL_MCP_PROVIDERS, current);
  next[providerId] = {
    ...next[providerId],
    enabled: false,
    connectorId: null,
  };
  writeFinancialMcpProviderConfig(next);
  return { success: true };
}

function disconnectMcpConnector(connectorId) {
  const disconnectedAt = new Date().toISOString();
  const connectors = getMcpConnectors().map((connector) =>
    connector.id === connectorId
      ? {
          ...connector,
          status: "disconnected",
          updatedAt: disconnectedAt,
        }
      : connector,
  );
  writeMcpConnectors(connectors);
  return connectors.find((connector) => connector.id === connectorId) || null;
}

function setSkillEnabled(skillId, enabled) {
  const current = readRawConfig();
  current.skills.entries[skillId] = {
    ...(current.skills.entries[skillId] || {}),
    enabled: Boolean(enabled),
  };
  writeRawConfig(current);
  return current;
}

function setCommandState(commandId, patch) {
  const current = readRawConfig();
  current.commands.entries[commandId] = {
    ...(current.commands.entries[commandId] || {}),
    ...patch,
  };
  writeRawConfig(current);
  return current;
}

function setPluginEnabled(pluginName, enabled) {
  const current = readRawConfig();
  current.plugins = {
    ...(current.plugins || {}),
    entries: {
      ...((current.plugins && current.plugins.entries) || {}),
      [pluginName]: {
        ...((((current.plugins && current.plugins.entries) || {})[pluginName]) || {}),
        enabled: Boolean(enabled),
      },
    },
  };
  writeRawConfig(current);
  return current;
}

function setBuiltinAgentEnabled(agentId, enabled) {
  const current = readRawConfig();
  current.agents.builtins[agentId] = Boolean(enabled);
  writeRawConfig(current);
  return current;
}

function upsertCustomAgent(agent) {
  const current = readRawConfig();
  const normalized = {
    id: agent.id,
    name: agent.name,
    description: agent.description || "",
    prompt: agent.prompt || "",
    enabled: agent.enabled !== false,
    source: agent.source || "settings",
    updatedAt: new Date().toISOString(),
  };
  const existingIndex = current.agents.custom.findIndex((entry) => entry.id === normalized.id);

  if (existingIndex >= 0) {
    current.agents.custom[existingIndex] = {
      ...current.agents.custom[existingIndex],
      ...normalized,
    };
  } else {
    current.agents.custom.push(normalized);
  }

  writeRawConfig(current);
  return current;
}

function removeCustomAgent(agentId) {
  const current = readRawConfig();
  current.agents.custom = current.agents.custom.filter((agent) => agent.id !== agentId);
  writeRawConfig(current);
  return current;
}

function storeExternalImport(importResult) {
  const current = readRawConfig();
  const importedPaths = new Set(current.externalConfig.importedPaths || []);
  importedPaths.add(importResult.path);

  const importedAgents = new Map(
    (current.externalConfig.importedAgents || []).map((agent) => [agent.id, agent]),
  );

  for (const agent of importResult.agents || []) {
    importedAgents.set(agent.id, {
      ...agent,
      source: agent.source || "external-config",
      updatedAt: new Date().toISOString(),
    });
  }

  current.externalConfig.importedPaths = Array.from(importedPaths);
  current.externalConfig.importedAgents = Array.from(importedAgents.values());
  current.externalConfig.lastImportedAt = new Date().toISOString();
  writeRawConfig(current);
  return current;
}

function storeDetectedPaths(paths) {
  const current = readRawConfig();
  current.externalConfig.detectedPaths = paths;
  current.externalConfig.lastDetectedAt = new Date().toISOString();
  writeRawConfig(current);
  return current;
}

module.exports = {
  DEFAULT_CONFIG,
  DEFAULT_WORKSPACE_DIR,
  FINANCIAL_MCP_CATALOG,
  STORE_DIR,
  STORE_FILE,
  getConfig,
  updateConfig,
  getFinancialSettings,
  updateFinancialSettings,
  getFinancialMcpProviders,
  connectFinancialMcpProvider,
  disconnectFinancialMcpProvider,
  checkFinancialMcpProvider,
  syncFinancialMcpProviders,
  setSkillEnabled,
  setCommandState,
  setPluginEnabled,
  setBuiltinAgentEnabled,
  upsertCustomAgent,
  removeCustomAgent,
  storeExternalImport,
  storeDetectedPaths,
  getMcpConnectors,
  addMcpConnector,
  deleteMcpConnector,
  setMcpConnectorEnabled,
  checkMcpConnector,
  disconnectMcpConnector,
};
