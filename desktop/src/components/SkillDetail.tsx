import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { Skill } from '../types/skills';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { settingsVariants, settingsTransitions } from '../lib/animations';

interface SkillDetailProps {
  skill: Skill;
  selectedFilePath: string;
  onToggle: (id: string) => void;
  onEdit: (filePath: string) => void;
  onShowInFolder: (filePath: string) => void;
}

export const SkillDetail = memo(function SkillDetail({
  skill,
  selectedFilePath,
  onToggle,
  onEdit,
  onShowInFolder,
}: SkillDetailProps) {
  const [fileContent, setFileContent] = useState('');
  const [isLoadingFile, setIsLoadingFile] = useState(true);
  const [fileError, setFileError] = useState('');
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');

  useEffect(() => {
    const loadFileContent = async () => {
      if (!window.electronAPI?.readSkillFile || !selectedFilePath) {
        setFileContent('');
        setIsLoadingFile(false);
        return;
      }

      setIsLoadingFile(true);
      setFileError('');
      try {
        const result = await window.electronAPI.readSkillFile(selectedFilePath);
        setFileContent(result?.content || '');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to read skill file';
        setFileError(message);
        setFileContent('');
      } finally {
        setIsLoadingFile(false);
      }
    };

    void loadFileContent();
  }, [selectedFilePath]);

  const handleToggle = useCallback(() => {
    onToggle(skill.id);
  }, [onToggle, skill.id]);

  const handleEdit = useCallback(() => {
    onEdit(selectedFilePath || skill.filePath);
  }, [onEdit, selectedFilePath, skill.filePath]);

  const handleShowInFolder = useCallback(() => {
    onShowInFolder(selectedFilePath || skill.filePath);
  }, [onShowInFolder, selectedFilePath, skill.filePath]);

  const formattedDate = new Date(skill.updatedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const selectedFileName = useMemo(() => {
    const parts = (selectedFilePath || '').split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || skill.name;
  }, [selectedFilePath, skill.name]);

  const isPrimarySkillFile = selectedFilePath === skill.filePath;
  const title = isPrimarySkillFile ? skill.name : selectedFileName;

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
          {skill.isVerified && (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              style={{ color: 'var(--accent-light)' }}
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
          )}
        </h2>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleToggle}
            className={`connector-toggle shrink-0 ${skill.isEnabled ? 'enabled' : ''}`}
            role="switch"
            aria-checked={skill.isEnabled}
            title={skill.isEnabled ? 'Disable skill' : 'Enable skill'}
          >
            <span className={`connector-toggle-thumb ${skill.isEnabled ? 'enabled' : ''}`} />
          </button>

          {skill.source !== 'official' && (
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
          )}
        </div>
      </div>

      {isPrimarySkillFile && (
        <>
          <div className="flex gap-8 px-5 py-3.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>Added by</span>
              <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                {skill.source === 'official' ? 'Excelor' : skill.source === 'community' ? 'Anthropic' : 'You'}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>Last updated</span>
              <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{formattedDate}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>Trigger</span>
              <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                {skill.command || `Slash command + auto`}
              </span>
            </div>
          </div>

          <div className="px-5 py-3.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[10px] font-medium uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>Description</span>
            </div>
            <p className="text-[13px] leading-[1.6]" style={{ color: 'var(--text-secondary)' }}>
              {skill.description || 'No description provided.'}
            </p>
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
