const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    // Service management
    getStatus: () => ipcRenderer.invoke("get-status"),
    getPorts: () => ipcRenderer.invoke("get-ports"),
    restartServices: () => ipcRenderer.invoke("restart-services"),

    // Events from main process
    onServiceStatus: (callback) => {
        const handler = (_event, status) => callback(status);
        ipcRenderer.on("service-status", handler);
        return () => ipcRenderer.removeListener("service-status", handler);
    },
    onPortsResolved: (callback) => {
        const handler = (_event, ports) => callback(ports);
        ipcRenderer.on("ports-resolved", handler);
        return () => ipcRenderer.removeListener("ports-resolved", handler);
    },
    onServicesReady: (callback) => {
        const handler = () => callback();
        ipcRenderer.on("services-ready", handler);
        return () => ipcRenderer.removeListener("services-ready", handler);
    },
    onServiceError: (callback) => {
        const handler = (_event, msg) => callback(msg);
        ipcRenderer.on("service-error", handler);
        return () => ipcRenderer.removeListener("service-error", handler);
    },

    // Browser view controls
    browserShow: (bounds) => ipcRenderer.invoke("browser-show", bounds),
    browserHide: () => ipcRenderer.invoke("browser-hide"),
    browserNavigate: (url) => ipcRenderer.invoke("browser-navigate", url),
    browserLoadExcelor: () => ipcRenderer.invoke("browser-load-excelor"),
    browserGoBack: () => ipcRenderer.invoke("browser-go-back"),
    browserGoForward: () => ipcRenderer.invoke("browser-go-forward"),
    browserReload: () => ipcRenderer.invoke("browser-reload"),
    browserStop: () => ipcRenderer.invoke("browser-stop"),
    browserOpenExternal: (url) => ipcRenderer.invoke("browser-open-external", url),
    onBrowserStateChange: (callback) => {
        const handler = (_event, state) => callback(state);
        ipcRenderer.on("browser-state-changed", handler);
        return () => ipcRenderer.removeListener("browser-state-changed", handler);
    },

    // Window controls
    minimizeWindow: () => ipcRenderer.send("minimize-window"),
    maximizeWindow: () => ipcRenderer.send("maximize-window"),
    closeWindow: () => ipcRenderer.send("close-window"),

    // Editor navigation
    onNavigateEditor: (callback) => {
        const handler = (_event, url) => callback(url);
        ipcRenderer.on("navigate-editor", handler);
        return () => ipcRenderer.removeListener("navigate-editor", handler);
    },
    onExcelorCloseRequested: (callback) => {
        const handler = () => callback();
        ipcRenderer.on("excelor-close-requested", handler);
        return () => ipcRenderer.removeListener("excelor-close-requested", handler);
    },
    onExcelorBrowserToolFocus: (callback) => {
        const handler = () => callback();
        ipcRenderer.on("excelor-browser-tool-focus", handler);
        return () => ipcRenderer.removeListener("excelor-browser-tool-focus", handler);
    },
    onExcelorBrowserToolRestore: (callback) => {
        const handler = () => callback();
        ipcRenderer.on("excelor-browser-tool-restore", handler);
        return () => ipcRenderer.removeListener("excelor-browser-tool-restore", handler);
    },
    onExcelorApplySubagentTool: (callback) => {
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on("excelor-apply-subagent-tool", handler);
        return () => ipcRenderer.removeListener("excelor-apply-subagent-tool", handler);
    },
    respondExcelorSubagentTool: (requestId, result) => ipcRenderer.send("excelor-subagent-tool-result", { requestId, result }),
    excelorBootstrap: (scope = "main") => ipcRenderer.invoke("excelor-bootstrap", { scope }),
    excelorRunTurn: (input, scope = "main") => ipcRenderer.invoke("excelor-run-turn", { input, scope }),
    excelorListSubagents: (scope = "main") => ipcRenderer.invoke("excelor-list-subagents", { scope }),
    excelorLaunch: (input, scope = "main") => ipcRenderer.invoke("excelor-launch", { input, scope }),
    onExcelorSnapshot: (callback) => {
        const handler = (_event, snapshot) => callback(snapshot);
        ipcRenderer.on("excelor-snapshot", handler);
        return () => ipcRenderer.removeListener("excelor-snapshot", handler);
    },
    updateExcelorContext: (scopeOrContext, maybeContext) => {
        if (typeof scopeOrContext === "string") {
            return ipcRenderer.invoke("excelor-update-context", scopeOrContext, maybeContext || {});
        }
        return ipcRenderer.invoke("excelor-update-context", scopeOrContext || {});
    },

    // Workspace file management
    listWorkspaceFiles: () => ipcRenderer.invoke("list-workspace-files"),
    createWorkspaceFile: (options) => ipcRenderer.invoke("create-workspace-file", options || {}),
    openWorkspaceFile: (filePath) => ipcRenderer.invoke("open-workspace-file", filePath),
    onWorkspaceFilesChanged: (callback) => {
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on("workspace-files-changed", handler);
        return () => ipcRenderer.removeListener("workspace-files-changed", handler);
    },

    // Provider settings
    getProviderSettings: () => ipcRenderer.invoke("get-provider-settings"),
    getProviderMeta: () => ipcRenderer.invoke("get-provider-meta"),
    setActiveProvider: (id) => ipcRenderer.invoke("set-active-provider", id),
    connectProvider: (id, data) => ipcRenderer.invoke("connect-provider", id, data),
    disconnectProvider: (id) => ipcRenderer.invoke("disconnect-provider", id),
    updateProviderModel: (id, modelId) => ipcRenderer.invoke("update-provider-model", id, modelId),
    validateApiKey: (id, key) => ipcRenderer.invoke("validate-api-key", id, key),
    fetchProviderModels: (id, key) => ipcRenderer.invoke("fetch-provider-models", id, key),
    storeApiKey: (id, key) => ipcRenderer.invoke("store-api-key", id, key),
    getActiveProviderConfig: () => ipcRenderer.invoke("get-active-provider-config"),

    // OAuth Login
    loginOpenAiWithChatGpt: () => ipcRenderer.invoke("login-openai-with-chatgpt"),

    // Skills
    getSkills: () => ipcRenderer.invoke("get-skills"),
    setSkillEnabled: (skillId, enabled) => ipcRenderer.invoke("set-skill-enabled", skillId, enabled),
    resyncSkills: () => ipcRenderer.invoke("resync-skills"),
    openSkillInEditor: (filePath) => ipcRenderer.invoke("open-skill-in-editor", filePath),
    showSkillInFolder: (filePath) => ipcRenderer.invoke("show-skill-in-folder", filePath),

    // MCP Connectors
    getMcpConnectors: () => ipcRenderer.invoke("get-mcp-connectors"),
    addMcpConnector: (name, url) => ipcRenderer.invoke("add-mcp-connector", name, url),
    deleteMcpConnector: (connectorId) => ipcRenderer.invoke("delete-mcp-connector", connectorId),
    setMcpConnectorEnabled: (connectorId, enabled) => ipcRenderer.invoke("set-mcp-connector-enabled", connectorId, enabled),
    checkMcpConnector: (connectorId) => ipcRenderer.invoke("check-mcp-connector", connectorId),
    disconnectMcpConnector: (connectorId) => ipcRenderer.invoke("disconnect-mcp-connector", connectorId),

    // Local Provider Connections
    testOllamaConnection: (url) => ipcRenderer.invoke("test-ollama-connection", url),
    testLMStudioConnection: (url) => ipcRenderer.invoke("test-lmstudio-connection", url),

    // Custom Model Management
    getCustomModels: (providerId) => ipcRenderer.invoke("get-custom-models", providerId),
    addCustomModel: (providerId, modelId, modelName) => ipcRenderer.invoke("add-custom-model", providerId, modelId, modelName),
    removeCustomModel: (providerId, modelId) => ipcRenderer.invoke("remove-custom-model", providerId, modelId),
    getMergedModels: (providerId) => ipcRenderer.invoke("get-merged-models", providerId),

    // PDF viewer
    readPdfFile: (filePath) => {
        const pathString = typeof filePath === "string" ? filePath : (filePath?.path && typeof filePath.path === "string" ? filePath.path : String(filePath || ""));
        return ipcRenderer.invoke("pdf:readFile", pathString);
    },
    getDocumentHighlights: (filePath) => ipcRenderer.invoke("pdf:getDocumentHighlights", typeof filePath === "string" ? filePath : filePath?.path ?? ""),
    saveDocumentHighlights: (filePath, highlights) => ipcRenderer.invoke("pdf:saveDocumentHighlights", typeof filePath === "string" ? filePath : filePath?.path ?? "", highlights),
    getLastViewedPage: (filePath) => ipcRenderer.invoke("pdf:getLastViewedPage", typeof filePath === "string" ? filePath : filePath?.path ?? ""),
    saveLastViewedPage: (filePath, pageNumber) => ipcRenderer.invoke("pdf:saveLastViewedPage", typeof filePath === "string" ? filePath : filePath?.path ?? "", pageNumber),
    extractPdfText: (filePath) => ipcRenderer.invoke("pdf:extractText", typeof filePath === "string" ? filePath : filePath?.path ?? ""),
    extractPdfTextFromBuffer: (base64) => ipcRenderer.invoke("pdf:extractTextFromBuffer", base64),
});
