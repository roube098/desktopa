import React, { useState, useMemo } from 'react';
import { ProviderCard } from './ProviderCard';
import { PROVIDER_ORDER, PROVIDER_META, FIRST_VISIBLE_COUNT } from '../data/providers';

interface ProviderGridProps {
    settings: ProviderSettings | null;
    selectedProvider: string | null;
    onSelectProvider: (id: string) => void;
    expanded: boolean;
    onToggleExpanded: () => void;
}

export function ProviderGrid({ settings, selectedProvider, onSelectProvider, expanded, onToggleExpanded }: ProviderGridProps) {
    const [search, setSearch] = useState('');

    const filteredProviders = useMemo(() => {
        if (!search.trim()) return PROVIDER_ORDER;
        const query = search.toLowerCase();
        return PROVIDER_ORDER.filter(id => {
            const meta = PROVIDER_META[id];
            return meta.name.toLowerCase().includes(query);
        });
    }, [search]);

    return (
        <div className="provider-grid-container">
            {/* Header */}
            <div className="provider-grid-header">
                <span className="provider-grid-title">Providers</span>
                <div className="provider-search-wrapper">
                    <svg className="provider-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search Providers"
                        className="provider-search-input"
                    />
                    {search && (
                        <button className="provider-search-clear" onClick={() => setSearch('')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* First row (always visible) */}
            <div className="provider-grid">
                {filteredProviders.slice(0, FIRST_VISIBLE_COUNT).map(id => (
                    <ProviderCard
                        key={id}
                        providerId={id}
                        connectedProvider={settings?.connectedProviders?.[id]}
                        isActive={settings?.activeProviderId === id}
                        isSelected={selectedProvider === id}
                        onSelect={onSelectProvider}
                    />
                ))}
            </div>

            {/* Expanded rows */}
            {expanded && filteredProviders.length > FIRST_VISIBLE_COUNT && (
                <div className="provider-grid provider-grid-expanded">
                    {filteredProviders.slice(FIRST_VISIBLE_COUNT).map(id => (
                        <ProviderCard
                            key={id}
                            providerId={id}
                            connectedProvider={settings?.connectedProviders?.[id]}
                            isActive={settings?.activeProviderId === id}
                            isSelected={selectedProvider === id}
                            onSelect={onSelectProvider}
                        />
                    ))}
                </div>
            )}

            {/* Show All toggle */}
            {filteredProviders.length > FIRST_VISIBLE_COUNT && (
                <div className="provider-grid-toggle">
                    <button onClick={onToggleExpanded}>{expanded ? 'Hide' : 'Show All'}</button>
                </div>
            )}
        </div>
    );
}
