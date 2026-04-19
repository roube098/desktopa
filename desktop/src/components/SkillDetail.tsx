import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { Skill } from '../types/skills';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SkillScopeChip } from './SkillListRowMeta';
import { formatSkillDate, hasBrandColor } from '../lib/skill-view-helpers';
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

  const formattedDate = formatSkillDate(skill.updatedAt);

  const selectedFileName = useMemo(() => {
    const parts = (selectedFilePath || '').split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || skill.name;
  }, [selectedFilePath, skill.name]);

  const isPrimarySkillFile = selectedFilePath === skill.filePath;
  const displayTitle = skill.interface?.displayName || skill.name;
  const title = isPrimarySkillFile ? displayTitle : selectedFileName;
  const subtitle =
    skill.interface?.shortDescription || skill.shortDescription || skill.description || '';
  const heroAccent = hasBrandColor(skill) ? skill.interface!.brandColor!.trim() : undefined;

  const sourceLabel =
    skill.source === 'official' ? 'Excelor' : skill.source === 'community' ? 'Community' : 'Local / custom';

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
        <h2 className="text-[15px] font-semibold flex items-center gap-2 min-w-0" style={{ color: 'var(--text-primary)' }}>
          <span className="truncate">{title}</span>
          {skill.isVerified && (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="shrink-0"
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
          <header
            className="skill-detail-hero px-5 py-4 flex-shrink-0 border-l-[3px]"
            style={{
              borderBottom: '1px solid var(--border)',
              borderLeftColor: heroAccent || 'transparent',
            }}
          >
            <h3 className="text-[18px] font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
              {displayTitle}
            </h3>
            {subtitle ? (
              <p className="skill-detail-sub mt-1.5 text-[13px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                {subtitle}
              </p>
            ) : null}
            <div className="skill-detail-chips mt-3 flex flex-wrap items-center gap-2">
              <SkillScopeChip skill={skill} />
              {skill.pluginName ? (
                <span className="skill-plugin-chip" title="Plugin">
                  Plugin: {skill.pluginName}
                </span>
              ) : null}
              {skill.isVerified ? (
                <span className="skill-verified-chip">Verified</span>
              ) : null}
            </div>
          </header>

          <div className="flex flex-wrap gap-x-8 gap-y-3 px-5 py-3.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex flex-col gap-0.5 min-w-[100px]">
              <span className="text-[10px] font-medium uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>Source</span>
              <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{sourceLabel}</span>
            </div>
            <div className="flex flex-col gap-0.5 min-w-[100px]">
              <span className="text-[10px] font-medium uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>Last updated</span>
              <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{formattedDate}</span>
            </div>
            <div className="flex flex-col gap-0.5 min-w-[120px]">
              <span className="text-[10px] font-medium uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>Trigger</span>
              <span className="text-[13px] font-mono font-medium break-all" style={{ color: 'var(--text-primary)' }}>
                {skill.command || 'Slash command + auto'}
              </span>
            </div>
          </div>

          <section className="px-5 py-3.5 flex-shrink-0 skill-detail-section" style={{ borderBottom: '1px solid var(--border)' }}>
            <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-2" style={{ color: 'var(--text-muted)' }}>Description</h4>
            <p className="text-[13px] leading-[1.65]" style={{ color: 'var(--text-secondary)' }}>
              {skill.description || 'No description provided.'}
            </p>
          </section>

          {skill.dependencies?.tools && skill.dependencies.tools.length > 0 ? (
            <section className="px-5 py-3.5 flex-shrink-0 skill-detail-section" style={{ borderBottom: '1px solid var(--border)' }}>
              <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-2" style={{ color: 'var(--text-muted)' }}>Dependencies</h4>
              <div className="overflow-x-auto">
                <table className="skill-detail-deps w-full text-left text-[12px]">
                  <thead>
                    <tr>
                      <th className="skill-detail-deps-th">Type</th>
                      <th className="skill-detail-deps-th">Value</th>
                      <th className="skill-detail-deps-th">Transport</th>
                      <th className="skill-detail-deps-th">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skill.dependencies.tools.map((t, idx) => (
                      <tr key={`${t.type}-${t.value}-${idx}`}>
                        <td className="skill-detail-deps-td font-mono">{t.type}</td>
                        <td className="skill-detail-deps-td font-mono break-all">{t.value}</td>
                        <td className="skill-detail-deps-td">{t.transport ?? '—'}</td>
                        <td className="skill-detail-deps-td">{t.description ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {skill.policy ? (
            <section className="px-5 py-3.5 flex-shrink-0 skill-detail-section" style={{ borderBottom: '1px solid var(--border)' }}>
              <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-2" style={{ color: 'var(--text-muted)' }}>Policy</h4>
              <dl className="skill-detail-policy text-[13px] space-y-1">
                <div className="flex gap-2">
                  <dt style={{ color: 'var(--text-muted)' }}>Implicit invocation</dt>
                  <dd style={{ color: 'var(--text-primary)' }}>
                    {skill.policy.allowImplicitInvocation !== false ? 'Allowed' : 'Disallowed'}
                  </dd>
                </div>
                {skill.policy.products && skill.policy.products.length > 0 ? (
                  <div className="flex gap-2">
                    <dt style={{ color: 'var(--text-muted)' }}>Products</dt>
                    <dd style={{ color: 'var(--text-primary)' }}>{skill.policy.products.join(', ')}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}

          <footer className="skill-detail-meta px-5 py-3 flex-shrink-0 flex flex-wrap gap-x-6 gap-y-2 text-[12px]" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <span className="min-w-0 break-all">
              Path: <code className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{skill.filePath}</code>
            </span>
            <span>Updated {formattedDate}</span>
            {skill.githubUrl ? (
              <a href={skill.githubUrl} target="_blank" rel="noreferrer" className="underline hover:opacity-90" style={{ color: 'var(--accent-light)' }}>
                View source
              </a>
            ) : null}
          </footer>
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
                    {fileContent ? fileContent.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').trimStart() : '*Empty file.*'}
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
