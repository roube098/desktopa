/**
 * Type declarations for the Electron preload API.
 * These types mirror the methods exposed via contextBridge in preload.js.
 */

interface ServiceStatus {
    backend: string;
    onlyoffice: string;
}

interface Ports {
    backend: number;
    onlyoffice: number;
    editorBridge: number;
}

interface WorkspaceFile {
    name: string;
    ext: string;
    path: string;
    size: number;
    relativePath: string;
}

interface WorkspaceFilesResult {
    success: boolean;
    files: WorkspaceFile[];
    error?: string;
}

interface OpenFileResult {
    success: boolean;
    mode?: 'editor' | 'external';
    url?: string;
    path?: string;
    error?: string;
}

interface OpenPdfInOnlyofficeResult {
    success: boolean;
    editorUrl?: string;
    fileName?: string;
    error?: string;
}

type WorkspaceCreateFormat = 'xlsx' | 'docx' | 'pptx' | 'pdf';

interface CreateWorkspaceFileOptions {
    format: WorkspaceCreateFormat;
    title?: string;
    open?: boolean;
    scope?: ExcelorScope;
}

interface CreateWorkspaceFileResult {
    success: boolean;
    message?: string;
    format?: WorkspaceCreateFormat;
    fileName?: string;
    workspacePath?: string;
    editorUrl?: string;
    scope?: ExcelorScope;
    error?: string;
}

interface WorkspaceFilesChangedEvent {
    reason: string;
    fileName: string;
    workspacePath: string;
    relativePath: string;
    updatedAt: string;
}

interface BrowserBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface BrowserState {
    url: string;
    isLoading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
}

type ExcelorScope = 'main' | 'onlyoffice';

interface ExcelorContext {
    documentContext: string;
    editorLoaded: boolean;
    editorUrl?: string;
    editorFrameStatus?: 'idle' | 'assigned' | 'ready' | 'failed';
    editorFrameMessage?: string;
    mcpAppContext?: McpAppDesktopContext | null;
    resetThread?: boolean;
    scope?: ExcelorScope;
}

interface McpAppDesktopContext {
    appId: string;
    connectorId: string;
    connectorName: string;
    title: string;
    sessionId: string;
    resourceUri: string;
    canvasId?: string;
    checkpointId?: string;
    summaryText?: string;
    shapeCount?: number;
    updatedAt?: string;
}

interface McpAppContentBlock {
    type: string;
    text?: string;
    [key: string]: unknown;
}

interface McpAppSessionInfo {
    sessionId: string;
    protocolVersion: string;
    connector: {
        id: string;
        name: string;
        title?: string;
        url: string;
        isBuiltIn?: boolean;
        builtInAppId?: string;
        builtInKind?: string;
        autoOpenOnExec?: boolean;
        resourceUri?: string;
    };
    serverInfo?: {
        name?: string;
        version?: string;
        title?: string;
        description?: string;
    };
    serverCapabilities?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

interface McpAppState {
    scope: ExcelorScope;
    sessionId: string;
    connectorId: string;
    connectorName: string;
    connectorTitle?: string;
    resourceUri: string;
    builtInAppId?: string;
    title: string;
    toolName: string;
    toolArguments?: Record<string, unknown>;
    toolResult: {
        content: unknown[];
        structuredContent?: unknown;
        meta?: Record<string, unknown>;
    };
    modelContext?: {
        content?: McpAppContentBlock[];
        structuredContent?: Record<string, unknown>;
    } | null;
    invocationId?: string;
    pending?: boolean;
    dispatchToolInput?: boolean;
    updatedAt: string;
}

type GatewayRuntimeStatus =
    | 'idle'
    | 'linking'
    | 'waiting_for_qr'
    | 'linked'
    | 'starting'
    | 'running'
    | 'connected'
    | 'stopping'
    | 'error';

interface HeartbeatSettings {
    whatsapp: {
        accountId: string;
        enabled: boolean;
        linkedPhone: string | null;
        authDir: string;
        allowFrom: string[];
    };
    heartbeat: {
        enabled: boolean;
        intervalMinutes: number;
        activeHours: {
            start: string;
            end: string;
            timezone: string;
            daysOfWeek: number[];
        };
    };
    checklist: string;
}

interface HeartbeatRuntimeState {
    status: GatewayRuntimeStatus;
    connected: boolean;
    linking: boolean;
    qrText: string | null;
    linkedPhone: string | null;
    lastError: string | null;
}

interface HeartbeatRuntimeSnapshot {
    settings: HeartbeatSettings;
    state: HeartbeatRuntimeState;
}

interface SoulSettings {
    content: string;
    hasUserOverride: boolean;
    source: 'user' | 'bundled' | 'empty';
    userPath: string;
    bundledPath: string | null;
}

interface ExcelorSubagentToolRequest {
    requestId: string;
    scope?: ExcelorScope;
    contextType: string;
    toolName: string;
    args: Record<string, unknown>;
}

interface ExcelorSubagentDescriptor {
    id: string;
    nickname: string;
    role: string;
    roleName: string;
    parentThreadId: string;
    depth: number;
    status: 'idle' | 'running' | 'waiting' | 'completed' | 'failed' | 'closed';
    createdAt: string;
    updatedAt: string;
    lastActivityAt: string;
    lastMessage?: string;
    lastOutput?: string;
    lastError?: string;
    taskPrompt?: string;
    terminalOutcome?: string;
    /** Conversation this subagent belongs to; omitted on descriptors created before this field existed. */
    conversationId?: string;
}

interface ExcelorSubagentPromptEntry {
    id: string;
    agentId: string;
    prompt: string;
    createdAt: string;
    toolName: 'spawn_agent' | 'send_input';
    /** Present for prompts recorded after conversation scoping; omitted on older persisted entries. */
    conversationId?: string;
}

interface ExcelorMessage {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    createdAt: string;
}

interface ExcelorSkillProposalEntry {
    id: string;
    proposalId: string;
    action: 'create' | 'update';
    name: string;
    description: string;
    body: string;
    skillNameToUpdate?: string;
    createdAt: string;
    status?: 'pending' | 'accepted' | 'rejected';
}

interface SkillApprovalPayload {
    proposalId: string;
    action: 'create' | 'update';
    name: string;
    description: string;
    body: string;
    skillNameToUpdate?: string;
}

interface SkillApprovalResult {
    ok: boolean;
    error?: string;
    message?: string;
    path?: string;
    skillsChanged?: boolean;
    proposalId?: string;
    approvedAt?: string;
}

interface ExcelorActivityEntry {
    id: string;
    kind: string;
    status?: string;
    title: string;
    detail?: string;
    createdAt: string;
    sourceAgentId?: string;
    subagentEventType?: string;
}

interface ExcelorSnapshot {
    scope: ExcelorScope;
    /** Server/client conversation id; new id on each resetConversation. */
    conversationId?: string;
    id: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    activeTurnId: string | null;
    draftAssistantText?: string;
    messages: ExcelorMessage[];
    activity: ExcelorActivityEntry[];
    lastError: string;
    subagents: ExcelorSubagentDescriptor[];
    subagentPrompts: ExcelorSubagentPromptEntry[];
    skillProposals?: ExcelorSkillProposalEntry[];
    context: ExcelorContext;
}

interface ProviderMeta {
    id: string;
    name: string;
    label: string;
    helpUrl: string | null;
    color: string;
    category: string;
}

interface ConnectedProvider {
    providerId?: string;
    connectionStatus: string;
    selectedModelId: string | null;
    apiKey?: string;
    customBaseUrl?: string;
    baseUrl?: string | null;
    models?: Array<{ id: string; name?: string }>;
    availableModels?: Array<{ id: string; name?: string; custom?: boolean }>;
    hasStoredKey?: boolean;
    excelorSupported?: boolean;
    excelorSupportReason?: string;
}

interface ProviderSettings {
    activeProviderId: string | null;
    connectedProviders: Record<string, ConnectedProvider>;
}

interface ProviderMetaResult {
    meta: Record<string, ProviderMeta>;
    order: string[];
    staticModels: Record<string, Array<{ id: string; name?: string }>>;
}

interface ActiveProviderConfig {
    providerId: string;
    modelId: string;
    apiKey: string | null;
    baseUrl?: string | null;
}

interface OAuthResult {
    connected: boolean;
    error?: string;
    accessToken?: string;
}

interface DesktopSkill {
    id: string;
    name: string;
    command: string;
    description: string;
    source: 'official' | 'community' | 'custom';
    isEnabled: boolean;
    isVerified: boolean;
    isHidden: boolean;
    filePath: string;
    githubUrl?: string;
    updatedAt: string;
}

interface SkillTreeNode {
    name: string;
    path: string;
    relativePath: string;
    type: 'folder' | 'file';
    children: SkillTreeNode[];
}

interface SkillFileContent {
    path: string;
    content: string;
    updatedAt: string;
}

interface DesktopPlugin {
    id: string;
    name: string;
    description: string;
    source: 'builtin' | 'user' | 'project' | 'external';
    desktopSource: 'official' | 'custom';
    path: string;
    manifestPath: string;
    filePath: string;
    isLegacy: boolean;
    isEnabled: boolean;
    scopes: string[];
    loadError?: string;
    updatedAt: string;
    components: {
        skills: string[];
        tools: string[];
        hooks: string[];
        commands: string[];
        agents: string[];
    };
}

interface PluginTreeNode {
    name: string;
    path: string;
    relativePath: string;
    type: 'folder' | 'file';
    children: PluginTreeNode[];
}

interface PluginFileContent {
    path: string;
    content: string;
    updatedAt: string;
}

type McpConnectorStatus = 'connected' | 'disconnected' | 'error' | 'connecting';

interface McpConnector {
    id: string;
    name: string;
    title?: string;
    description?: string;
    url: string;
    status: McpConnectorStatus;
    isEnabled: boolean;
    isBuiltIn?: boolean;
    builtInAppId?: string;
    builtInKind?: string;
    autoOpenOnExec?: boolean;
    resourceUri?: string;
    lastConnectedAt?: string;
    createdAt?: string;
    updatedAt?: string;
}

type FinancialMcpAuthType = 'api-key' | 'oauth' | 'sso';

interface FinancialMcpProviderMeta {
    id: string;
    name: string;
    label: string;
    urlTemplate: string;
    authType: FinancialMcpAuthType;
    color: string;
    helpUrl: string | null;
    notes: string;
}

interface FinancialMcpProviderState {
    providerId: string;
    enabled: boolean;
    apiKey?: string;
    connectorId: string | null;
    connectorStatus: McpConnectorStatus;
    mcpUrl?: string;
}

interface FinancialSettingsState {
    dataProvider: 'financialdatasets' | 'exa' | 'tavily';
    apiKeys: {
        financialdatasets?: string;
        exa?: string;
        tavily?: string;
    };
    mcpProviders?: Record<string, { enabled?: boolean; apiKey?: string; connectorId?: string | null }>;
}

interface ElectronAPI {
    // Service management
    getStatus: () => Promise<ServiceStatus>;
    getPorts: () => Promise<Ports>;
    restartServices: () => Promise<void>;

    // Events from main process
    onServiceStatus: (callback: (status: ServiceStatus) => void) => () => void;
    onPortsResolved: (callback: (ports: Ports) => void) => () => void;
    onServicesReady: (callback: () => void) => () => void;
    onServiceError: (callback: (msg: string) => void) => () => void;

    // Browser controls
    browserShow: (bounds: BrowserBounds) => Promise<{ success: boolean }>;
    browserHide: () => Promise<{ success: boolean }>;
    browserNavigate: (url: string) => Promise<{ success: boolean }>;
    browserLoadExcelor: () => Promise<{ success: boolean }>;
    browserGoBack: () => Promise<{ success: boolean }>;
    browserGoForward: () => Promise<{ success: boolean }>;
    browserReload: () => Promise<{ success: boolean }>;
    browserStop: () => Promise<{ success: boolean }>;
    browserOpenExternal: (url: string) => Promise<{ success: boolean }>;
    onBrowserStateChange: (callback: (state: BrowserState) => void) => () => void;

    // Window controls
    minimizeWindow: () => void;
    maximizeWindow: () => void;
    closeWindow: () => void;

    // Editor navigation
    onNavigateEditor: (callback: (url: string) => void) => () => void;
    onExcelorCloseRequested: (callback: () => void) => () => void;
    onExcelorBrowserToolFocus: (callback: () => void) => () => void;
    onExcelorBrowserToolRestore: (callback: () => void) => () => void;
    onExcelorApplySubagentTool: (callback: (request: ExcelorSubagentToolRequest) => void) => () => void;
    respondExcelorSubagentTool: (requestId: string, result: unknown) => void;
    excelorBootstrap: (scope?: ExcelorScope) => Promise<ExcelorSnapshot>;
    excelorRunTurn: (input: string, scope?: ExcelorScope) => Promise<ExcelorSnapshot>;
    excelorListSubagents: (scope?: ExcelorScope) => Promise<ExcelorSubagentDescriptor[]>;
    excelorLaunch: (input?: string, scope?: ExcelorScope) => Promise<ExcelorSnapshot>;
    excelorAbortTurn: (scope?: ExcelorScope) => Promise<ExcelorSnapshot>;
    approveSkillProposal: (payload: SkillApprovalPayload, scope?: ExcelorScope) => Promise<SkillApprovalResult>;
    onExcelorSnapshot: (callback: (snapshot: ExcelorSnapshot) => void) => () => void;
    updateExcelorContext: (scopeOrContext: ExcelorScope | ExcelorContext, context?: ExcelorContext) => Promise<ExcelorContext>;
    getActiveMcpApp: () => Promise<McpAppState | null>;
    onMcpAppStateChange: (callback: (state: McpAppState | null) => void) => () => void;
    mcpAppOpenSession: (connectorId: string) => Promise<McpAppSessionInfo>;
    mcpAppListResources: (sessionId: string, cursor?: string) => Promise<Record<string, unknown>>;
    mcpAppListResourceTemplates: (sessionId: string, cursor?: string) => Promise<Record<string, unknown>>;
    mcpAppReadResource: (sessionId: string, uri: string) => Promise<Record<string, unknown>>;
    mcpAppCallTool: (sessionId: string, toolName: string, args?: Record<string, unknown>) => Promise<Record<string, unknown>>;
    mcpAppProxyUiMessage: (sessionId: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>;
    mcpAppHandleMessage: (payload: { scope?: ExcelorScope; sessionId?: string; content?: McpAppContentBlock[] }) => Promise<{ isError?: boolean; message?: string }>;
    mcpAppUpdateModelContext: (payload: { sessionId?: string; content?: McpAppContentBlock[]; structuredContent?: Record<string, unknown> }) => Promise<{ success: boolean }>;
    mcpAppMarkReady: (payload?: { sessionId?: string } | string) => Promise<{ success: boolean }>;
    mcpAppClose: (payload?: { sessionId?: string } | string) => Promise<{ success: boolean }>;

    // Heartbeat settings
    getHeartbeatSettings: () => Promise<HeartbeatSettings>;
    updateHeartbeatSettings: (patch: Partial<HeartbeatSettings>) => Promise<HeartbeatSettings>;
    startWhatsAppLink: () => Promise<void>;
    cancelWhatsAppLink: () => Promise<void>;
    unlinkWhatsApp: () => Promise<{ success: boolean }>;
    startHeartbeatGateway: () => Promise<void>;
    stopHeartbeatGateway: () => Promise<void>;
    onHeartbeatRuntimeState: (callback: (snapshot: HeartbeatRuntimeSnapshot) => void) => () => void;

    // Soul settings
    getSoulSettings: () => Promise<SoulSettings>;
    updateSoulSettings: (content: string) => Promise<SoulSettings>;
    resetSoulSettings: () => Promise<SoulSettings>;

    // Workspace file management
    listWorkspaceFiles: () => Promise<WorkspaceFilesResult>;
    createWorkspaceFile: (options: CreateWorkspaceFileOptions) => Promise<CreateWorkspaceFileResult>;
    openWorkspaceFile: (filePath: string) => Promise<OpenFileResult>;
    onWorkspaceFilesChanged: (callback: (event: WorkspaceFilesChangedEvent) => void) => () => void;

    // Provider settings
    getProviderSettings: () => Promise<ProviderSettings>;
    getProviderMeta: () => Promise<ProviderMetaResult>;
    setActiveProvider: (id: string) => Promise<ProviderSettings>;
    connectProvider: (id: string, data: Partial<ConnectedProvider>) => Promise<ProviderSettings>;
    disconnectProvider: (id: string) => Promise<ProviderSettings>;
    updateProviderModel: (id: string, modelId: string) => Promise<ProviderSettings>;
    validateApiKey: (id: string, key: string) => Promise<{ valid: boolean; error?: string }>;
    fetchProviderModels: (id: string, key: string) => Promise<{ models?: Array<{ id: string; name?: string }>; error?: string }>;
    storeApiKey: (id: string, key: string) => Promise<{ success: boolean }>;
    getActiveProviderConfig: () => Promise<ActiveProviderConfig | null>;

    // OAuth Login
    loginOpenAiWithChatGpt: () => Promise<OAuthResult>;

    // Local Provider Connections
    testOllamaConnection: (url: string) => Promise<{ success: boolean; models?: Array<{ id: string; name?: string; toolSupport?: string }>; error?: string }>;
    testLMStudioConnection: (url: string) => Promise<{ success: boolean; models?: Array<{ id: string; name?: string; toolSupport?: string }>; error?: string }>;

    // Custom Model Management
    getCustomModels: (providerId: string) => Promise<Array<{ id: string; name?: string; custom?: boolean }>>;
    addCustomModel: (providerId: string, modelId: string, modelName?: string) => Promise<Array<{ id: string; name?: string; custom?: boolean }>>;
    removeCustomModel: (providerId: string, modelId: string) => Promise<Array<{ id: string; name?: string; custom?: boolean }>>;
    getMergedModels: (providerId: string) => Promise<Array<{ id: string; name?: string; custom?: boolean }>>;

    // Skills
    getSkills: () => Promise<DesktopSkill[]>;
    setSkillEnabled: (skillId: string, enabled: boolean) => Promise<DesktopSkill[]>;
    resyncSkills: () => Promise<DesktopSkill[]>;
    onSkillsChanged: (callback: () => void) => () => void;
    getSkillTree: (skillId: string) => Promise<SkillTreeNode | null>;
    readSkillFile: (filePath: string) => Promise<SkillFileContent>;
    openSkillInEditor: (filePath: string) => Promise<{ success: boolean }>;
    showSkillInFolder: (filePath: string) => Promise<{ success: boolean }>;
    getPlugins: () => Promise<DesktopPlugin[]>;
    setPluginEnabled: (pluginName: string, enabled: boolean) => Promise<DesktopPlugin[]>;
    resyncPlugins: () => Promise<DesktopPlugin[]>;
    getPluginTree: (pluginId: string) => Promise<PluginTreeNode | null>;
    readPluginFile: (filePath: string) => Promise<PluginFileContent>;
    openPluginInEditor: (filePath: string) => Promise<{ success: boolean }>;
    showPluginInFolder: (filePath: string) => Promise<{ success: boolean }>;

    // MCP Connectors
    getMcpConnectors: () => Promise<McpConnector[]>;
    addMcpConnector: (name: string, url: string) => Promise<McpConnector>;
    deleteMcpConnector: (connectorId: string) => Promise<{ success: boolean }>;
    setMcpConnectorEnabled: (connectorId: string, enabled: boolean) => Promise<McpConnector | null>;
    checkMcpConnector: (connectorId: string) => Promise<McpConnector>;
    disconnectMcpConnector: (connectorId: string) => Promise<McpConnector | null>;

    // Financial settings
    getFinancialSettings: () => Promise<FinancialSettingsState>;
    updateFinancialSettings: (patch: Partial<FinancialSettingsState>) => Promise<FinancialSettingsState>;
    getFinancialMcpProviders: () => Promise<{
        catalog: FinancialMcpProviderMeta[];
        states: Record<string, FinancialMcpProviderState>;
    }>;
    connectFinancialMcpProvider: (providerId: string, apiKey?: string) => Promise<FinancialMcpProviderState>;
    disconnectFinancialMcpProvider: (providerId: string) => Promise<{ success: boolean }>;
    checkFinancialMcpProvider: (providerId: string) => Promise<FinancialMcpProviderState>;
    syncFinancialMcpProviders: () => Promise<{
        catalog: FinancialMcpProviderMeta[];
        states: Record<string, FinancialMcpProviderState>;
    }>;

    // PDF: ONLYOFFICE + text extraction for chat context / attachments
    openPdfInOnlyoffice: (filePath: string | { path: string }) => Promise<OpenPdfInOnlyofficeResult>;
    extractPdfText: (filePath: string | { path: string }) => Promise<{ text?: string; pageCount?: number; error?: string }>;
    extractPdfTextFromBuffer: (base64: string) => Promise<{ text?: string; pageCount?: number; error?: string }>;
}

interface Window {
    electronAPI: ElectronAPI;
}
