/** Inline built-in MCP app row (e.g. tldraw) merged into the main thread timeline. */
export type InlineMcpAppEntry = {
    sessionId: string;
    /** Sort key; use `Date.parse(updatedAt)` from `McpAppState`. */
    createdAtMs: number;
    appState: McpAppState;
    onClose: () => void;
};
