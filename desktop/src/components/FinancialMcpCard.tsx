import React, { useCallback } from 'react';

interface FinancialMcpCardProps {
    provider: FinancialMcpProviderMeta;
    state?: FinancialMcpProviderState;
    isSelected: boolean;
    onSelect: (providerId: string) => void;
}

function getProviderGlyph(name: string): string {
    const trimmed = String(name || '').trim();
    if (!trimmed) return '?';
    const first = trimmed.split(/\s+/)[0] || trimmed;
    return first.slice(0, 1).toUpperCase();
}

export function FinancialMcpCard({ provider, state, isSelected, onSelect }: FinancialMcpCardProps) {
    const handleClick = useCallback(() => {
        onSelect(provider.id);
    }, [onSelect, provider.id]);

    const isConnected = state?.enabled && state?.connectorStatus === 'connected';

    let cardClass = 'provider-card';
    if (isConnected) cardClass += ' active-ready';
    else if (isSelected) cardClass += ' selected';

    return (
        <button className={cardClass} onClick={handleClick} title={provider.name}>
            {isConnected && (
                <span className="provider-connected-badge" title="Connected">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                </span>
            )}
            <div className="provider-logo-wrapper">
                <div className="financial-mcp-logo" style={{ borderColor: provider.color, color: provider.color }}>
                    {getProviderGlyph(provider.name)}
                </div>
            </div>
            <span className="provider-card-name">{provider.name}</span>
            <span className="provider-card-label">{provider.label}</span>
        </button>
    );
}
