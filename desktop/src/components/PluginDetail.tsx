import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { DesktopPlugin } from '../types/plugins';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { settingsVariants, settingsTransitions } from '../lib/animations';

interface PluginDetailProps {
  plugin: DesktopPlugin;
  selectedFilePath: string;
  onToggle: (name: string) => void;
  onEdit: (filePath: string) => void;
  onShowInFolder: (filePath: string) => void;
}

function buildComponentSummary(plugin: DesktopPlugin): string[] {
  const sections = [
    { label: 'skills', count: plugin.components.skills.length },
    { label: 'tools', count: plugin.components.tools.length },
    { label: 'hooks', count: plugin.components.hooks.length },
    { label: 'commands', count: plugin.components.commands.length },
    { label: 'agents', count: plugin.components.agents.length },
  ].filter((entry) => entry.count > 0);

  return sections.map((entry) => `${entry.label} ${entry.count}`);
}

export const PluginDetail = memo(function PluginDetail({
  plugin,
  selectedFilePath,
  onToggle,
  onEdit,
  onShowInFolder,
}: PluginDetailProps) {
  const [fileContent, setFileContent] = useState('');
  const [isLoadingFile, setIsLoadingFile] = useState(true);
  const [fileError, setFileError] = useState('');
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');

  useEffect(() => {
    const loadFileContent = async () => {
      if (!window.electronAPI?.readPluginFile || !selectedFilePath) {
        setFileContent('');
        setIsLoadingFile(false);
        return;
      }

      setIsLoadingFile(true);
      setFileError('');
      try {
        const result = await window.electronAPI.readPluginFile(selectedFilePath);
        setFileContent(result?.content || '');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to read plugin file';
        setFileError(message);
        setFileContent('');
      } finally {
        setIsLoadingFile(false);
      }
    };

    void loadFileContent();
  }, [selectedFilePath]);

  const handleToggle = useCallback(() => {
    onToggle(plugin.name);
  }, [onToggle, plugin.name]);

  const handleEdit = useCallback(() => {
    onEdit(selectedFilePath || plugin.filePath || plugin.manifestPath || plugin.path);
  }, [onEdit, selectedFilePath, plugin.filePath, plugin.manifestPath, plugin.path]);

  const handleShowInFolder = useCallback(() => {
    onShowInFolder(selectedFilePath || plugin.path);
  }, [onShowInFolder, selectedFilePath, plugin.path]);

  const formattedDate = new Date(plugin.updatedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const selectedFileName = useMemo(() => {
    const parts = (selectedFilePath || '').split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || plugin.name;
  }, [selectedFilePath, plugin.name]);

  const sourceLabel = plugin.desktopSource === 'official' ? 'By Excelor' : plugin.source;
  const componentSummary = useMemo(() => buildComponentSummary(plugin), [plugin]);
  const primaryFilePath = plugin.filePath || plugin.manifestPath || plugin.path;
  const isPrimaryPluginFile = selectedFilePath === primaryFilePath;
  const title = isPrimaryPluginFile ? plugin.name : selectedFileName;

  return (
    <motion.div
      variants={settingsVariants.fadeSlide}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={settingsTransitions.enter}
      className="flex h-full flex-col text-foreground overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <h2 className="text-[15px] font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          {title}
          {plugin.isLegacy && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
              Legacy
            </span>
          )}
        </h2>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleToggle}
            className={`connector-toggle shrink-0 ${plugin.isEnabled ? 'enabled' : ''}`}
            role="switch"
            aria-checked={plugin.isEnabled}
            title={plugin.isEnabled ? 'Disable plugin' : 'Enable plugin'}
          >
            <span className={`connector-toggle-thumb ${plugin.isEnabled ? 'enabled' : ''}`} />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded p-1 transition-colors" style={{ color: 'var(--text-muted)' }}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="19" cy="12" r="1.5" />
                </svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleEdit}>Open File</DropdownMenuItem>
              <DropdownMenuItem onClick={handleShowInFolder}>Show in Folder</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isPrimaryPluginFile && (
        <>
          <div className="flex gap-8 px-5 py-3.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>Source</span>
              <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{sourceLabel}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>Last updated</span>
              <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{formattedDate}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>Scopes</span>
              <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{plugin.scopes.join(', ') || 'all'}</span>
            </div>
          </div>

          <div className="px-5 py-3.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[10px] font-medium uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>Description</span>
            </div>
            <p className="text-[13px] leading-[1.6]" style={{ color: 'var(--text-secondary)' }}>
              {plugin.description || 'No description provided.'}
            </p>
            {componentSummary.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {componentSummary.map((item) => (
                  <span
                    key={`${plugin.id}-${item}`}
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                  >
                    {item}
                  </span>
                ))}
              </div>
            )}
            {plugin.loadError && (
              <div className="mt-3 rounded-lg px-3 py-2 text-[11px] leading-5" style={{ border: '1px solid rgba(248, 81, 73, 0.2)', background: 'rgba(248, 81, 73, 0.08)', color: 'var(--error)' }}>
                {plugin.loadError}
              </div>
            )}
          </div>
        </>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        <div className="relative min-h-full">
          <div className="absolute top-0 right-0 flex items-center rounded-md p-0.5" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
            <button
              onClick={() => setViewMode('preview')}
              className="p-1 rounded transition-colors"
              style={{
                background: viewMode === 'preview' ? 'var(--bg-elevated)' : 'transparent',
                color: viewMode === 'preview' ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('code')}
              className="p-1 rounded transition-colors"
              style={{
                background: viewMode === 'code' ? 'var(--bg-elevated)' : 'transparent',
                color: viewMode === 'code' ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </button>
          </div>
          <div className="pr-20">
            {isLoadingFile && (
              <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Loading file...</div>
            )}

            {!isLoadingFile && fileError && (
              <div className="text-[13px] rounded-lg px-3 py-2" style={{ color: 'var(--error)', background: 'rgba(248, 81, 73, 0.08)', border: '1px solid rgba(248, 81, 73, 0.2)' }}>{fileError}</div>
            )}

            {!isLoadingFile && !fileError && viewMode === 'preview' && (
              <div className="skills-markdown">
                <Markdown remarkPlugins={[remarkGfm]}>
                  {fileContent || '*Empty file.*'}
                </Markdown>
              </div>
            )}

            {!isLoadingFile && !fileError && viewMode === 'code' && (
              <pre className="text-[12px] leading-relaxed rounded-lg p-4 overflow-auto whitespace-pre-wrap break-words font-mono" style={{ color: 'var(--text-primary)', background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
                {fileContent || ''}
              </pre>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
});
