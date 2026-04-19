import React, { useState, useEffect } from 'react';
import { AuiIf } from "@assistant-ui/react";
import { MessageSquarePlus } from 'lucide-react';
import { MyThread } from "./MyThread";
import type { SkillProposalEntry } from "../types/skills";
import type { PlanModeEntry, PlanProposalEntry } from "../types/plan-mode";
import type { AgentConfig } from "../types/agent-types";
import type { InlineMcpAppEntry } from "../types/inline-mcp-app";

interface TitlebarProps {
    toggleLeft?: () => void;
    toggleRight?: () => void;
    isLeftOpen?: boolean;
    isRightOpen?: boolean;
    /** When true, the right pane toggle is inactive (e.g. dashboard/settings). */
    rightToggleDisabled?: boolean;
    onOpenSettings: () => void;
    onOpenBrowser?: () => void;
    /** Clears the main Excelor chat and backend conversation state. */
    onNewChat?: () => void;
}

export function Titlebar({ toggleLeft, toggleRight, isLeftOpen, isRightOpen, rightToggleDisabled, onOpenSettings, onOpenBrowser, onNewChat }: TitlebarProps) {
    const minimize = () => window.electronAPI?.minimizeWindow();
    const maximize = () => window.electronAPI?.maximizeWindow();
    const close = () => window.electronAPI?.closeWindow();

    return (
        <header id="titlebar">

            <div className="titlebar-drag">
                <div className="titlebar-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" />
                        <rect x="14" y="14" width="7" height="7" rx="1" />
                    </svg>
                </div>
                <span className="titlebar-text">Excelor</span>
            </div>
            <div className="titlebar-controls">
                {toggleLeft && (
                    <button className={`titlebar-btn ${isLeftOpen ? 'active' : ''}`} title="Toggle Left Pane" onClick={toggleLeft}>
                        {isLeftOpen ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
                        ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
                        )}
                    </button>
                )}
                {onNewChat && (
                    <button type="button" className="titlebar-btn" title="New chat" onClick={onNewChat}>
                        <MessageSquarePlus size={14} strokeWidth={2} />
                    </button>
                )}
                {onOpenBrowser && (
                    <button className="titlebar-btn" title="Open Browser" onClick={onOpenBrowser}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="2" y1="12" x2="22" y2="12"></line>
                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                        </svg>
                    </button>
                )}
                {toggleRight && (
                    <button
                        type="button"
                        className={`titlebar-btn ${isRightOpen ? 'active' : ''}`}
                        title={rightToggleDisabled ? 'Open browser or OnlyOffice to use the right pane' : 'Toggle Right Pane'}
                        onClick={toggleRight}
                        disabled={rightToggleDisabled}
                        style={rightToggleDisabled ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                    >
                        {isRightOpen ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line></svg>
                        ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line></svg>
                        )}
                    </button>
                )}
                <button className="titlebar-btn" title="Settings" onClick={onOpenSettings}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                </button>
                <button className="titlebar-btn" title="Minimize" onClick={minimize}>
                    <svg width="12" height="12" viewBox="0 0 12 12">
                        <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                </button>
                <button className="titlebar-btn" title="Maximize" onClick={maximize}>
                    <svg width="12" height="12" viewBox="0 0 12 12">
                        <rect x="2" y="2" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
                    </svg>
                </button>
                <button className="titlebar-btn close" title="Close" onClick={close}>
                    <svg width="12" height="12" viewBox="0 0 12 12">
                        <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.5" />
                        <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                </button>
            </div>
        </header>
    );
}

interface RecentFile {
    name: string;
    url: string;
    ext: string;
}

interface DashboardProps {
    ports: Ports;
    openEditor: (ext: string, isRecent?: boolean, path?: string, pdfSourcePath?: string) => void;
    /** After ONLYOFFICE opens a new workspace PDF (create flow), load text for chat context. */
    primePdfContextFromPath?: (filePath: string) => void;
    subagents?: ExcelorSubagentDescriptor[];
    subagentActivity?: ExcelorActivityEntry[];
    promptHistory?: ExcelorSubagentPromptEntry[];
    skillProposals?: SkillProposalEntry[];
    planMode?: PlanModeEntry | null;
    planProposals?: PlanProposalEntry[];
    excelorConversationId?: string;
    inlineMcpApps?: InlineMcpAppEntry[];
}

export const EXCELOR_AGENT_CONFIG: AgentConfig = {
    id: 'excelor',
    name: 'Excelor',
    icon: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.93V17a1 1 0 0 1-2 0v-.07A8 8 0 0 1 4.07 9H5a1 1 0 0 1 0 2 6 6 0 0 0 6 6zm-1-4a3 3 0 1 1 3-3 3 3 0 0 1-3 3z',
    color: '#6366f1',
    colorLight: '#eef2ff',
    description: 'Deep financial research agent',
    contextValue: 'general',
    fileTypes: [],
    systemPrompt: '',
    tools: [],
    suggestions: [
        'Analyze Apple\'s latest earnings',
        'Compare NVIDIA vs AMD financials',
        'What is the P/E ratio of Tesla?',
        'Show me the balance sheet for Microsoft',
    ],
};

function DashboardThreadUI({
    subagents = [],
    activity = [],
    promptHistory = [],
    skillProposals = [],
    planMode,
    planProposals = [],
    excelorConversationId,
    inlineMcpApps = [],
}: {
    subagents?: ExcelorSubagentDescriptor[];
    activity?: ExcelorActivityEntry[];
    promptHistory?: ExcelorSubagentPromptEntry[];
    skillProposals?: SkillProposalEntry[];
    planMode?: PlanModeEntry | null;
    planProposals?: PlanProposalEntry[];
    excelorConversationId?: string;
    inlineMcpApps?: InlineMcpAppEntry[];
}) {
    return (
        <>
            <AuiIf condition={(s) => s.thread.isEmpty}>
                <div className="dashboard-prompt-container">
                    <div className="prompt-header-text">How can I help you today?</div>
                    <MyThread
                        agentConfig={EXCELOR_AGENT_CONFIG}
                        subagents={subagents}
                        activity={activity}
                        promptHistory={promptHistory}
                        skillProposals={skillProposals}
                        planProposals={planProposals}
                        planMode={planMode}
                        excelorPlanScope="main"
                        excelorConversationId={excelorConversationId}
                        inlineMcpApps={inlineMcpApps}
                    />
                </div>
            </AuiIf>

            <AuiIf condition={(s) => !s.thread.isEmpty}>
                <div className="dashboard-thread-active" style={{ flexGrow: 1, overflow: 'hidden', display: 'flex', width: '100%', maxWidth: '800px', margin: '0 auto', flexDirection: 'column' }}>
                    <MyThread
                        agentConfig={EXCELOR_AGENT_CONFIG}
                        subagents={subagents}
                        activity={activity}
                        promptHistory={promptHistory}
                        skillProposals={skillProposals}
                        planProposals={planProposals}
                        planMode={planMode}
                        excelorPlanScope="main"
                        excelorConversationId={excelorConversationId}
                        inlineMcpApps={inlineMcpApps}
                    />
                </div>
            </AuiIf>
        </>
    );
}

export function Dashboard({
    ports,
    openEditor,
    primePdfContextFromPath,
    subagents = [],
    subagentActivity = [],
    promptHistory = [],
    skillProposals = [],
    planMode = null,
    planProposals = [],
    excelorConversationId,
    inlineMcpApps = [],
}: DashboardProps) {
    const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [creatingFormat, setCreatingFormat] = useState<'xlsx' | 'docx' | 'pptx' | 'pdf' | null>(null);
    const [createError, setCreateError] = useState('');

    useEffect(() => {
        try {
            const saved = localStorage.getItem("spreadsheet-agent-settings");
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.displayName) setDisplayName(parsed.displayName);
            }
        } catch (e) { }
    }, []);

    useEffect(() => {
        async function fetchRecent() {
            try {
                const res = await fetch(`http://localhost:${ports.onlyoffice}/example/`);
                if (!res.ok) throw new Error("Failed to load example page");
                const html = await res.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, "text/html");
                const rows = doc.querySelectorAll('table tbody tr');

                const files: RecentFile[] = [];
                rows.forEach(row => {
                    const link = row.querySelector('.file-name a');
                    if (link) {
                        files.push({
                            name: link.textContent?.trim() || '',
                            url: link.getAttribute('href') || '',
                            ext: (link.textContent?.trim().split('.').pop() || '').toLowerCase()
                        });
                    }
                });
                setRecentFiles(files);
            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                setLoading(false);
            }
        }
        fetchRecent();
    }, [ports]);

    const handleQuickCreate = async (format: 'xlsx' | 'docx' | 'pptx' | 'pdf') => {
        if (creatingFormat) return;
        if (!window.electronAPI?.createWorkspaceFile) {
            setCreateError('Workspace create API is unavailable.');
            return;
        }

        setCreateError('');
        setCreatingFormat(format);
        try {
            const result = await window.electronAPI.createWorkspaceFile({
                format,
                open: true,
            });
            if (!result.success) {
                setCreateError(result.error || 'Failed to create file.');
            } else if (format === 'pdf' && result.workspacePath && primePdfContextFromPath) {
                primePdfContextFromPath(result.workspacePath);
            }
        } catch (err: unknown) {
            setCreateError(err instanceof Error ? err.message : String(err));
        } finally {
            setCreatingFormat(null);
        }
    };

    return (
        <div id="dashboard" className="dashboard-container">
                <AuiIf condition={(s) => s.thread.isEmpty}>
                    <div className="dashboard-hero">
                        <h1>Welcome back, {displayName || 'User'}</h1>
                    </div>

                    <div className="dashboard-action-pills">
                        <button className="action-pill" onClick={() => handleQuickCreate('xlsx')} disabled={creatingFormat !== null}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 3h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"></path><path d="M22 9H2"></path><path d="M22 15H2"></path><path d="M12 3v18"></path></svg>
                            {creatingFormat === 'xlsx' ? 'Creating...' : 'Spreadsheet'}
                        </button>
                        <button className="action-pill" onClick={() => handleQuickCreate('docx')} disabled={creatingFormat !== null}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            {creatingFormat === 'docx' ? 'Creating...' : 'Document'}
                        </button>
                        <button className="action-pill" onClick={() => handleQuickCreate('pptx')} disabled={creatingFormat !== null}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16v12H4z"></path><path d="M8 22h8"></path><path d="M12 18v4"></path></svg>
                            {creatingFormat === 'pptx' ? 'Creating...' : 'Presentation'}
                        </button>
                        <button className="action-pill" onClick={() => handleQuickCreate('pdf')} disabled={creatingFormat !== null}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M9 15h.01"></path><path d="M9 12h.01"></path></svg>
                            {creatingFormat === 'pdf' ? 'Creating...' : 'PDF Form'}
                        </button>
                    </div>
                    {createError && (
                        <div className="loading-files" style={{ color: 'var(--error)', marginBottom: '8px' }}>
                            Error: {createError}
                        </div>
                    )}
                </AuiIf>

                {recentFiles.length > 0 && (
                    <div className="dashboard-recent" style={{ display: 'none' }}>
                        {/* Hiding recent documents for now as per the layout request, we'll keep it in DOM if needed later */}
                    </div>
                )}

                <DashboardThreadUI
                        subagents={subagents}
                        activity={subagentActivity}
                        promptHistory={promptHistory}
                        skillProposals={skillProposals}
                        planMode={planMode}
                        planProposals={planProposals}
                        excelorConversationId={excelorConversationId}
                        inlineMcpApps={inlineMcpApps}
                    />

                <AuiIf condition={(s) => s.thread.isEmpty}>
                    <div className="dashboard-recent">
                        <h2>Recent Documents</h2>
                        <ul className="recent-list">
                            {loading && <div className="loading-files">Loading files...</div>}
                            {error && <div className="loading-files" style={{ color: 'var(--error)' }}>Error: {error}</div>}
                            {!loading && !error && recentFiles.length === 0 && (
                                <div className="loading-files">No recent documents found.</div>
                            )}
                            {recentFiles.map((file, i) => (
                                <li key={i} className="recent-item" onClick={() => openEditor('xlsx', true, file.url)}>
                                    <div className="recent-item-info">
                                        <div className={`recent-icon ${file.ext}`}>{file.ext.substring(0, 3).toUpperCase()}</div>
                                        <span className="recent-name">{file.name}</span>
                                    </div>
                                    <div className="recent-item-actions">
                                        <button className="action-btn" title="Open">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                                <polyline points="15 3 21 3 21 9"></polyline>
                                                <line x1="10" y1="14" x2="21" y2="3"></line>
                                            </svg>
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </AuiIf>
        </div>
    );
}
