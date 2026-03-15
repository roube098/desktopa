import React, { useCallback } from 'react';
import { ProviderLogo, isProviderReady, providerRequiresStoredKey, PROVIDER_META } from '../data/providers';

interface ProviderCardProps {
    providerId: string;
    connectedProvider?: ConnectedProvider;
    isActive: boolean;
    isSelected: boolean;
    onSelect: (id: string) => void;
}

export function ProviderCard({ providerId, connectedProvider, isActive, isSelected, onSelect }: ProviderCardProps) {
    const meta = PROVIDER_META[providerId];
    const isConnected = connectedProvider?.connectionStatus === 'connected';
    const providerReady = isProviderReady(connectedProvider);
    const showGreenBg = isActive && providerReady;
    const badgeTitle = providerReady
        ? 'Ready'
        : connectedProvider?.hasStoredKey === false && providerRequiresStoredKey(providerId)
            ? 'Reconnect to restore the API key'
            : 'Select a model';

    const handleClick = useCallback(() => onSelect(providerId), [onSelect, providerId]);

    let cardClass = 'provider-card';
    if (showGreenBg) cardClass += ' active-ready';
    else if (isSelected) cardClass += ' selected';

    return (
        <button className={cardClass} onClick={handleClick} title={meta.name}>
            {isConnected && (
                <span className="provider-connected-badge" title={badgeTitle}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                </span>
            )}
            <div className="provider-logo-wrapper">
                <ProviderLogo providerId={providerId} size={28} />
            </div>
            <span className="provider-card-name">{meta.name}</span>
            <span className="provider-card-label">{meta.label}</span>
        </button>
    );
}
