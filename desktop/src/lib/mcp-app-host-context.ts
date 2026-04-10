/** Display mode fields for MCP UI host context (inline vs fullscreen pane). */
export function getMcpAppDisplayHostFields(display: 'inline' | 'fullscreen'): {
    displayMode: 'inline' | 'fullscreen';
    availableDisplayModes: ('inline' | 'fullscreen')[];
} {
    const mode = display === 'inline' ? 'inline' : 'fullscreen';
    return {
        displayMode: mode,
        availableDisplayModes: [mode],
    };
}
