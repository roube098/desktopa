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
    mode?: 'editor' | 'external' | 'pdf';
    url?: string;
    path?: string;
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
    resetThread?: boolean;
    scope?: ExcelorScope;
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
    terminalOutcome?: string;
}

interface ExcelorMessage {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    createdAt: string;
}

interface ExcelorActivityEntry {
    id: string;
    kind: string;
    status?: string;
    title: string;
    detail?: string;
    createdAt: string;
    sourceAgentId?: string;
}

interface ExcelorSnapshot {
    scope: ExcelorScope;
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

type McpConnectorStatus = 'connected' | 'disconnected' | 'error' | 'connecting';

interface McpConnector {
    id: string;
    name: string;
    url: string;
    status: McpConnectorStatus;
    isEnabled: boolean;
    lastConnectedAt?: string;
    createdAt: string;
    updatedAt: string;
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
    onExcelorSnapshot: (callback: (snapshot: ExcelorSnapshot) => void) => () => void;
    updateExcelorContext: (scopeOrContext: ExcelorScope | ExcelorContext, context?: ExcelorContext) => Promise<ExcelorContext>;

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
    openSkillInEditor: (filePath: string) => Promise<{ success: boolean }>;
    showSkillInFolder: (filePath: string) => Promise<{ success: boolean }>;

    // MCP Connectors
    getMcpConnectors: () => Promise<McpConnector[]>;
    addMcpConnector: (name: string, url: string) => Promise<McpConnector>;
    deleteMcpConnector: (connectorId: string) => Promise<{ success: boolean }>;
    setMcpConnectorEnabled: (connectorId: string, enabled: boolean) => Promise<McpConnector | null>;
    checkMcpConnector: (connectorId: string) => Promise<McpConnector>;
    disconnectMcpConnector: (connectorId: string) => Promise<McpConnector | null>;

    // PDF viewer
    readPdfFile: (filePath: string | { path: string }) => Promise<string>;
    getDocumentHighlights: (filePath: string | { path: string }) => Promise<PdfHighlight[]>;
    saveDocumentHighlights: (filePath: string | { path: string }, highlights: PdfHighlight[]) => Promise<boolean>;
    getLastViewedPage: (filePath: string | { path: string }) => Promise<number>;
    saveLastViewedPage: (filePath: string | { path: string }, pageNumber: number) => Promise<boolean>;
    extractPdfText: (filePath: string | { path: string }) => Promise<{ text?: string; pageCount?: number; error?: string }>;
    extractPdfTextFromBuffer: (base64: string) => Promise<{ text?: string; pageCount?: number; error?: string }>;
}

interface PdfHighlight {
    id: string;
    pageNumber: number;
    text: string;
    rectsOnPage: Array<{ top: number; left: number; width: number; height: number }>;
}

interface Window {
    electronAPI: ElectronAPI;
}
