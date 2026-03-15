import { memo, useCallback } from 'react';
import type { Skill } from '../types/skills';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface SkillCardProps {
  skill: Skill;
  onToggle: (id: string) => void;
  onEdit: (filePath: string) => void;
  onShowInFolder: (filePath: string) => void;
}

export const SkillCard = memo(function SkillCard({
  skill,
  onToggle,
  onEdit,
  onShowInFolder,
}: SkillCardProps) {
  const handleToggle = useCallback(() => {
    onToggle(skill.id);
  }, [onToggle, skill.id]);

  const handleEdit = useCallback(() => {
    onEdit(skill.filePath);
  }, [onEdit, skill.filePath]);

  const handleShowInFolder = useCallback(() => {
    onShowInFolder(skill.filePath);
  }, [onShowInFolder, skill.filePath]);

  const formattedDate = new Date(skill.updatedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="group relative flex h-[164px] flex-col overflow-hidden rounded-xl border border-border bg-[var(--bg-secondary)] p-3.5 transition-all duration-200 hover:border-[var(--border-light)] hover:bg-[var(--bg-elevated)]">
      {/* Header: Name + Toggle */}
      <div className="flex flex-col space-y-1 pr-[60px]">
        <div className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
          <span className="max-w-full truncate">{skill.name}</span>
          {skill.isVerified && (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="mt-0.5 shrink-0 text-blue-500"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
          )}
        </div>
        <div className="line-clamp-3 text-[13px] leading-[1.4] text-muted-foreground">
          {skill.description}
        </div>
      </div>

      <button
        onClick={handleToggle}
        className={`absolute right-4 top-4 flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-secondary)] ${
          skill.isEnabled ? 'bg-blue-600 hover:bg-blue-500' : 'bg-[#404040] hover:bg-[#4a4a4a]'
        }`}
        role="switch"
        aria-checked={skill.isEnabled}
        aria-label={skill.isEnabled ? 'Disable skill' : 'Enable skill'}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            skill.isEnabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>

      {/* Footer: Badge + Date + Menu */}
      <div className="mt-auto flex items-center justify-between pt-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] font-medium text-foreground">
            {skill.source === 'official' && (
              <>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="text-blue-500"
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
                By Excelor
              </>
            )}
            {skill.source === 'community' && (
              <>
                <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                GitHub
              </>
            )}
            {skill.source === 'custom' && (
              <>
                <svg
                  className="h-2.5 w-2.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Built By You
              </>
            )}
          </span>
          <span className="text-[10px] text-muted-foreground">{formattedDate}</span>
        </div>

        {skill.source !== 'official' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-[var(--bg-tertiary)] hover:text-foreground"
                aria-label="Skill options"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="12" cy="19" r="1.5" />
                </svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleEdit}>
                <svg
                  className="mr-2 h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Open File
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleShowInFolder}>
                <svg
                  className="mr-2 h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                </svg>
                Show in Folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
});

