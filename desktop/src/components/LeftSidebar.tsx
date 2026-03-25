import React, { useEffect, useState } from 'react';
import { useWorkspaceFiles } from '../hooks/useWorkspaceFiles';

interface LeftSidebarProps {
    ports: Ports;
    openEditor: (ext: string, isRecent?: boolean, path?: string) => void;
    openPdf?: (filePath: string) => void;
    isOpen: boolean;
    onOpenSettings: () => void;
}

export function LeftSidebar({ ports, openEditor, openPdf, isOpen, onOpenSettings }: LeftSidebarProps) {
    const [openingFile, setOpeningFile] = useState<string | null>(null); // track which file is being opened
    const { files: workspaceFiles, loading, error, refresh } = useWorkspaceFiles();

    // Theme state
    const [theme, setTheme] = useState('dark');
    useEffect(() => {
        try {
            const savedTheme = localStorage.getItem('excelor-theme') || 'dark';
            setTheme(savedTheme);
            document.documentElement.setAttribute('data-theme', savedTheme);
        } catch (e) { }
    }, []);

    const toggleTheme = () => {
        const newTheme = theme === 'dark' ? 'beige' : 'dark';
        setTheme(newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('excelor-theme', newTheme);
    };

    useEffect(() => {
        if (!isOpen) return;
        void refresh(false);
    }, [isOpen, refresh]);

    // Open a workspace file in OnlyOffice
    const handleFileClick = async (file: WorkspaceFile) => {
        if (openingFile) return; // prevent double-clicks
        setOpeningFile(file.path);
        try {
            const result = await window.electronAPI.openWorkspaceFile(file.path);
            if (result.success) {
                if (result.mode === 'external') {
                    return;
                }
                if (result.mode === 'pdf' && result.path && openPdf) {
                    openPdf(result.path);
                    return;
                }
                // Determine editor type from extension
                const extMap: Record<string, string> = { xlsx: 'xlsx', xls: 'xlsx', docx: 'docx', doc: 'docx', pptx: 'pptx', ppt: 'pptx', pdf: 'pdf', csv: 'xlsx', md: 'docx', txt: 'docx' };
                const editorExt = extMap[file.ext] || 'xlsx';
                if (result.url) {
                    openEditor(editorExt, true, result.url);
                }
            } else {
                console.error('Failed to open file:', result.error);
            }
        } catch (err) {
            console.error('Error opening file:', err);
        } finally {
            setOpeningFile(null);
        }
    };

    // Icon for each file type
    const FileIcon = ({ ext }: { ext: string }) => {
        if (['xlsx', 'xls', 'csv'].includes(ext)) {
            return (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 3h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"></path>
                    <path d="M22 9H2"></path><path d="M22 15H2"></path><path d="M12 3v18"></path>
                </svg>
            );
        }
        if (['docx', 'doc', 'md', 'txt'].includes(ext)) {
            return (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
            );
        }
        if (['pptx', 'ppt'].includes(ext)) {
            return (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 6h16v12H4z"></path><path d="M8 22h8"></path><path d="M12 18v4"></path>
                </svg>
            );
        }
        if (ext === 'pdf') {
            return (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <path d="M9 15h.01"></path><path d="M9 12h.01"></path>
                </svg>
            );
        }
        // Default file icon
        return (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
        );
    };

    return (
        <aside id="left-sidebar" className={`left-sidebar ${!isOpen ? 'hidden' : ''}`}>
            <div className="left-sidebar-top">

                <div className="search-bar">
                    <span className="search-placeholder">Search files and tabs...</span>
                    <span className="search-shortcut">⌘K</span>
                </div>

                <div className="breadcrumbs">
                    <span className="breadcrumb-path">... / Documents / My Workspace</span>
                </div>

                <div className="file-tree">
                    {loading && <div className="tree-msg">Loading...</div>}
                    {error && <div className="tree-msg error">Error: {error}</div>}
                    {!loading && !error && workspaceFiles.length === 0 && (
                        <div className="tree-msg">No files found.</div>
                    )}
                    {workspaceFiles.map((file) => (
                        <div
                            key={file.path}
                            className={`tree-item ${openingFile === file.path ? 'opening' : ''}`}
                            onClick={() => handleFileClick(file)}
                            title={file.relativePath || file.name}
                        >
                            <div className={`tree-icon ${file.ext}`}>
                                <FileIcon ext={file.ext} />
                            </div>
                            <span className="tree-name">
                                {openingFile === file.path ? 'Opening...' : file.name}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="left-sidebar-footer">
                <button className="footer-btn" onClick={toggleTheme}>
                    {theme === 'dark' ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
                    ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                    )}
                    {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                </button>
                <button className="footer-btn" onClick={onOpenSettings}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    Settings
                </button>
            </div>
        </aside>
    );
}
