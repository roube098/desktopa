import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useState, type FC } from "react";
import { isProviderReady, PROVIDER_META, PROVIDER_ORDER, ProviderLogo } from "../data/providers";

type ModelOption = {
    id: string;
    name?: string;
    custom?: boolean;
};

type ModelGroup = {
    providerId: string;
    providerName: string;
    selectedModelId: string | null;
    models: ModelOption[];
    isActive: boolean;
    excelorSupported: boolean;
    excelorSupportReason: string;
};

function getProviderModels(provider: ConnectedProvider | undefined) {
    if (!provider) return [];

    const models = provider.availableModels ?? provider.models ?? [];
    if (!provider.selectedModelId || models.some((model) => model.id === provider.selectedModelId)) {
        return models;
    }

    return [{ id: provider.selectedModelId, name: provider.selectedModelId }, ...models];
}

function toModelValue(providerId: string, modelId: string) {
    return JSON.stringify({ providerId, modelId });
}

function parseModelValue(value: string): { providerId: string; modelId: string } | null {
    try {
        const parsed = JSON.parse(value) as { providerId?: string; modelId?: string };
        if (!parsed.providerId || !parsed.modelId) return null;
        return { providerId: parsed.providerId, modelId: parsed.modelId };
    } catch {
        return null;
    }
}

export const ComposerModelSelector: FC = () => {
    const [groups, setGroups] = useState<ModelGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [savingValue, setSavingValue] = useState<string | null>(null);

    async function loadGroups() {
        if (!window.electronAPI?.getProviderSettings) {
            setGroups([]);
            setLoading(false);
            return;
        }

        setLoading(true);

        try {
            const settings = await window.electronAPI.getProviderSettings();
            const connectedProviders = Object.entries(settings.connectedProviders ?? {}).filter(
                ([, provider]) => isProviderReady(provider),
            );

            const resolvedGroups = await Promise.all(
                connectedProviders.map(async ([providerId, provider]) => {
                    let models = getProviderModels(provider);
                    if (models.length === 0 && window.electronAPI?.getMergedModels) {
                        models = await window.electronAPI.getMergedModels(providerId);
                    }

                    if (provider.selectedModelId && !models.some((model) => model.id === provider.selectedModelId)) {
                        models = [{ id: provider.selectedModelId, name: provider.selectedModelId }, ...models];
                    }

                    return {
                        providerId,
                        providerName: PROVIDER_META[providerId]?.name ?? providerId,
                        selectedModelId: provider.selectedModelId ?? null,
                        models,
                        isActive: settings.activeProviderId === providerId,
                        excelorSupported: provider.excelorSupported !== false,
                        excelorSupportReason: provider.excelorSupportReason ?? '',
                    };
                }),
            );

            resolvedGroups.sort((left, right) => {
                const leftIndex = PROVIDER_ORDER.indexOf(left.providerId);
                const rightIndex = PROVIDER_ORDER.indexOf(right.providerId);
                return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex)
                    - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
            });

            setGroups(resolvedGroups.filter((group) => group.models.length > 0 || group.selectedModelId));
        } catch (error) {
            console.error("Failed to load composer models", error);
            setGroups([]);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void loadGroups();
    }, []);

    useEffect(() => {
        if (!open) return;
        void loadGroups();
    }, [open]);

    const activeGroup = groups.find((group) => group.isActive)
        ?? groups.find((group) => Boolean(group.selectedModelId))
        ?? groups[0];
    const currentModel = activeGroup?.models.find((model) => model.id === activeGroup.selectedModelId);
    const selectedValue = activeGroup?.selectedModelId
        ? toModelValue(activeGroup.providerId, activeGroup.selectedModelId)
        : "";
    const triggerDisabled = loading || groups.length === 0;

    let triggerLabel = "Connect model";
    if (savingValue) {
        triggerLabel = "Switching...";
    } else if (loading) {
        triggerLabel = "Loading models...";
    } else if (activeGroup && currentModel) {
        triggerLabel = currentModel.name || currentModel.id;
    } else if (activeGroup) {
        triggerLabel = "Select model";
    }

    async function handleValueChange(value: string) {
        const nextSelection = parseModelValue(value);
        if (!nextSelection) return;
        const { providerId, modelId } = nextSelection;
        if (value === selectedValue || savingValue) {
            setOpen(false);
            return;
        }

        setSavingValue(value);

        try {
            await window.electronAPI.updateProviderModel(providerId, modelId);
            await window.electronAPI.setActiveProvider(providerId);
            await loadGroups();
            setOpen(false);
        } catch (error) {
            console.error("Failed to switch model", error);
        } finally {
            setSavingValue(null);
        }
    }

    return (
        <DropdownMenu.Root open={open} onOpenChange={setOpen}>
            <DropdownMenu.Trigger asChild>
                <button
                    type="button"
                    className="aui-model-selector-trigger"
                    disabled={triggerDisabled}
                    aria-label="Select model"
                    title={activeGroup ? `${activeGroup.providerName}: ${triggerLabel}` : "Connect a provider in Settings first"}
                >
                    {activeGroup ? (
                        <ProviderLogo providerId={activeGroup.providerId} size={14} className="aui-model-selector-logo" />
                    ) : (
                        <svg className="aui-model-selector-fallback" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 3l2.4 4.86L20 10l-4 3.9.94 5.46L12 16.8l-4.94 2.56L8 13.9 4 10l5.6-2.14L12 3z" />
                        </svg>
                    )}
                    <span className="aui-model-selector-text">{triggerLabel}</span>
                    {activeGroup && !activeGroup.excelorSupported && (
                        <span className="aui-model-selector-unsupported-badge" title={activeGroup.excelorSupportReason || 'Not available in Excelor'}>
                            Unavailable
                        </span>
                    )}
                    <svg className="aui-model-selector-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    className="aui-model-selector-content"
                    align="start"
                    side="top"
                    sideOffset={8}
                    collisionPadding={12}
                >
                    {groups.length === 0 ? (
                        <div className="aui-model-selector-empty">
                            Connect a provider and choose a model in Settings.
                        </div>
                    ) : (
                        <DropdownMenu.RadioGroup value={selectedValue} onValueChange={(value) => void handleValueChange(value)}>
                            {groups.map((group, groupIndex) => (
                                <div key={group.providerId}>
                                    {groupIndex > 0 && <DropdownMenu.Separator className="aui-model-selector-separator" />}

                                    <div className="aui-model-selector-group-header">
                                        <div className="aui-model-selector-group-title">
                                            <ProviderLogo providerId={group.providerId} size={16} className="aui-model-selector-group-logo" />
                                            <span>{group.providerName}</span>
                                        </div>
                                        <div className="aui-model-selector-group-badges">
                                            {group.isActive && <span className="aui-model-selector-active-badge">Active</span>}
                                            {!group.excelorSupported && (
                                                <span
                                                    className="aui-model-selector-unsupported-badge"
                                                    title={group.excelorSupportReason || 'Not available in Excelor'}
                                                >
                                                    Not in Excelor
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {group.models.map((model) => {
                                        const itemValue = toModelValue(group.providerId, model.id);
                                        const isSelected = itemValue === selectedValue;

                                        return (
                                            <DropdownMenu.RadioItem
                                                key={itemValue}
                                                value={itemValue}
                                                className="aui-model-selector-item"
                                                disabled={Boolean(savingValue)}
                                            >
                                                <div className="aui-model-selector-item-copy">
                                                    <span className="aui-model-selector-item-name">{model.name || model.id}</span>
                                                    {model.name && model.name !== model.id && (
                                                        <span className="aui-model-selector-item-id">{model.id}</span>
                                                    )}
                                                </div>

                                                <div className="aui-model-selector-item-trailing">
                                                    {model.custom && <span className="aui-model-selector-custom-badge">Custom</span>}
                                                    {!group.excelorSupported && (
                                                        <span
                                                            className="aui-model-selector-unsupported-badge"
                                                            title={group.excelorSupportReason || 'Not available in Excelor'}
                                                        >
                                                            Not in Excelor
                                                        </span>
                                                    )}
                                                    <DropdownMenu.ItemIndicator asChild>
                                                        <svg
                                                            className={`aui-model-selector-check ${isSelected ? "is-visible" : ""}`}
                                                            width="14"
                                                            height="14"
                                                            viewBox="0 0 24 24"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="2.5"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        >
                                                            <polyline points="20 6 9 17 4 12" />
                                                        </svg>
                                                    </DropdownMenu.ItemIndicator>
                                                </div>
                                            </DropdownMenu.RadioItem>
                                        );
                                    })}
                                </div>
                            ))}
                        </DropdownMenu.RadioGroup>
                    )}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
};
