/**
 * Provider metadata for the frontend.
 * All 15 providers matching openwork's providerSettings.ts
 */

import React from 'react';

export interface ProviderMetaInfo {
    id: string;
    name: string;
    label: string;
    helpUrl: string | null;
    color: string;
    category: string;
}

export const PROVIDER_META: Record<string, ProviderMetaInfo> = {
    openai: {
        id: "openai", name: "OpenAI", label: "Service",
        helpUrl: "https://platform.openai.com/api-keys",
        color: "#10a37f", category: "classic",
    },
    anthropic: {
        id: "anthropic", name: "Anthropic", label: "Service",
        helpUrl: "https://console.anthropic.com/settings/keys",
        color: "#d4a373", category: "classic",
    },
    google: {
        id: "google", name: "Gemini", label: "Service",
        helpUrl: "https://aistudio.google.com/app/apikey",
        color: "#4285f4", category: "classic",
    },
    xai: {
        id: "xai", name: "xAI", label: "Service",
        helpUrl: "https://x.ai/api",
        color: "#ffffff", category: "classic",
    },
    deepseek: {
        id: "deepseek", name: "DeepSeek", label: "Service",
        helpUrl: "https://platform.deepseek.com/api_keys",
        color: "#0066ff", category: "classic",
    },
    moonshot: {
        id: "moonshot", name: "Moonshot AI", label: "Service",
        helpUrl: "https://platform.moonshot.ai/docs/guide/start-using-kimi-api",
        color: "#ff6b35", category: "classic",
    },
    zai: {
        id: "zai", name: "Z.AI", label: "Service",
        helpUrl: null,
        color: "#00d4aa", category: "classic",
    },
    minimax: {
        id: "minimax", name: "MiniMax", label: "Service",
        helpUrl: "https://platform.minimax.io/user-center/basic-information/interface-key",
        color: "#ff4081", category: "classic",
    },
    bedrock: {
        id: "bedrock", name: "AWS Bedrock", label: "Service",
        helpUrl: null,
        color: "#ff9900", category: "aws",
    },
    vertex: {
        id: "vertex", name: "Vertex AI", label: "Service",
        helpUrl: null,
        color: "#4285f4", category: "gcp",
    },
    "azure-foundry": {
        id: "azure-foundry", name: "Azure AI Foundry", label: "Service",
        helpUrl: "https://ai.azure.com",
        color: "#0078d4", category: "azure",
    },
    ollama: {
        id: "ollama", name: "Ollama", label: "Local Models",
        helpUrl: null,
        color: "#ffffff", category: "local",
    },
    lmstudio: {
        id: "lmstudio", name: "LM Studio", label: "Local Models",
        helpUrl: "https://lmstudio.ai/",
        color: "#a855f7", category: "local",
    },
    openrouter: {
        id: "openrouter", name: "OpenRouter", label: "Gateway",
        helpUrl: "https://openrouter.ai/keys",
        color: "#6366f1", category: "proxy",
    },
    litellm: {
        id: "litellm", name: "LiteLLM", label: "Service",
        helpUrl: null,
        color: "#22c55e", category: "hybrid",
    },
};

export const PROVIDER_ORDER: string[] = [
    "openai", "anthropic", "google", "deepseek", "xai", "moonshot",
    "zai", "minimax", "openrouter", "bedrock", "vertex", "azure-foundry",
    "ollama", "lmstudio", "litellm",
];

const PROVIDERS_WITHOUT_STORED_KEYS = new Set([
    'ollama',
    'lmstudio',
    'bedrock',
    'vertex',
    'azure-foundry',
]);

/** First N providers shown in collapsed view */
export const FIRST_VISIBLE_COUNT = 4;

export function providerRequiresStoredKey(providerId: string | undefined): boolean {
    if (!providerId) return false;
    return !PROVIDERS_WITHOUT_STORED_KEYS.has(providerId);
}

export function isProviderReady(provider: ConnectedProvider | null | undefined): boolean {
    if (!provider) return false;
    if (provider.connectionStatus !== "connected" || provider.selectedModelId === null) {
        return false;
    }

    if (providerRequiresStoredKey(provider.providerId) && provider.hasStoredKey === false) {
        return false;
    }

    return true;
}

export function hasAnyReadyProvider(settings: ProviderSettings | null | undefined): boolean {
    if (!settings?.connectedProviders) return false;
    return Object.values(settings.connectedProviders).some(isProviderReady);
}

const PROVIDER_LOGOS: Record<string, string> = {
    anthropic: 'anthropic.svg',
    openai: 'openai.svg',
    google: 'google.svg',
    xai: 'xai.svg',
    deepseek: 'deepseek.svg',
    moonshot: 'moonshot.svg',
    zai: 'zai.svg',
    bedrock: 'bedrock.svg',
    vertex: 'vertex.svg',
    'azure-foundry': 'azure.svg',
    ollama: 'ollama.svg',
    openrouter: 'openrouter.svg',
    litellm: 'litellm.svg',
    minimax: 'minimax.svg',
    lmstudio: 'lmstudio.png',
};

const DARK_INVERT_PROVIDERS = new Set(['openai', 'xai', 'ollama', 'openrouter']);

interface ProviderLogoProps {
    providerId: string;
    size?: number;
    className?: string;
}

/**
 * Provider logo image component matching openwork logos
 */
export function ProviderLogo({ providerId, size = 32, className = '' }: ProviderLogoProps) {
    const filename = PROVIDER_LOGOS[providerId];
    if (!filename) {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            </svg>
        );
    }

    // Invert white/black logos in dark mode (assuming app is mostly dark mode or uses a dark-invert class)
    const invertClass = DARK_INVERT_PROVIDERS.has(providerId) ? ' provider-logo-invert' : '';
    return (
        <img
            src={`assets/ai-logos/${filename}`}
            alt={`${providerId} logo`}
            style={{ width: size, height: size, objectFit: 'contain' }}
            className={`${className}${invertClass}`}
        />
    );
}
