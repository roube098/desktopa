import presentationSpecJson from '../../../shared/onlyoffice-presentation-spec.json';
import type { AgentTool, AgentToolParam } from '../types/agent-types';

type SpecParamType = 'string' | 'number' | 'boolean' | 'array' | 'object';

interface SpecParameter {
    name: string;
    type?: SpecParamType;
    description: string;
    required?: boolean;
    items?: SpecParameter;
}

interface PromptSection {
    title: string;
    lines: string[];
}

interface PresentationToolSpec {
    name: string;
    description: string;
    contextType: 'presentation';
    parameters: SpecParameter[];
}

interface PresentationAgentSpec {
    description: string;
    suggestions: string[];
    promptSections: PromptSection[];
}

interface OnlyOfficePresentationSpec {
    agent: PresentationAgentSpec;
    tools: PresentationToolSpec[];
}

export const ONLYOFFICE_PRESENTATION_SPEC = presentationSpecJson as OnlyOfficePresentationSpec;

function toAgentToolParam(param: SpecParameter): AgentToolParam {
    return {
        name: param.name,
        type: (param.type || 'string') as AgentToolParam['type'],
        description: param.description,
        required: param.required,
        items: param.items?.type ? { type: param.items.type } : undefined,
    };
}

export function buildOnlyOfficePresentationPrompt(): string {
    return ONLYOFFICE_PRESENTATION_SPEC.agent.promptSections
        .map((section) => [`## ${section.title}`, ...section.lines].join('\n'))
        .join('\n\n');
}

export function getOnlyOfficePresentationTools(): AgentTool[] {
    return ONLYOFFICE_PRESENTATION_SPEC.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters.map(toAgentToolParam),
    }));
}

export function getOnlyOfficePresentationSuggestions(): string[] {
    return [...ONLYOFFICE_PRESENTATION_SPEC.agent.suggestions];
}

export function getOnlyOfficePresentationDescription(): string {
    return ONLYOFFICE_PRESENTATION_SPEC.agent.description;
}
