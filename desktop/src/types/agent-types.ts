/**
 * Type definitions for file-type-specific AI agents.
 */

export interface AgentToolParam {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description: string;
    required?: boolean;
    items?: { type: string };
}

export interface AgentTool {
    name: string;
    description: string;
    parameters: AgentToolParam[];
}

export interface AgentConfig {
    id: string;
    name: string;
    icon: string;          // SVG path data for the agent icon
    color: string;         // Accent color (CSS)
    colorLight: string;    // Lighter tint for backgrounds
    description: string;
    contextValue: string;  // Matches the documentContext values
    fileTypes: string[];   // File extensions this agent handles
    systemPrompt: string;
    tools: AgentTool[];
    suggestions: string[]; // Quick-start suggestions shown in chat
}

export interface ToolExecutionResult {
    success: boolean;
    message: string;
    data?: unknown;
}
