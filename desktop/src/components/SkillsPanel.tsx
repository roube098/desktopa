import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Skill } from '../types/skills';
import { Input } from './ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { settingsVariants, settingsTransitions } from '../lib/animations';
import { SkillCard } from './SkillCard';

type FilterType = 'all' | 'active' | 'inactive' | 'official';

interface SkillsPanelProps {
  refreshTrigger?: number;
}

export function SkillsPanel({ refreshTrigger }: SkillsPanelProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [isAtBottom, setIsAtBottom] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadSkills = useCallback(async () => {
    if (!window.electronAPI?.getSkills) {
      setLoading(false);
      return;
    }

    try {
      const data = await window.electronAPI.getSkills();
      setSkills(data || []);
    } catch (err) {
      console.error('Failed to load skills:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills, refreshTrigger]);

  const visibleSkills = useMemo(() => skills.filter((skill) => !skill.isHidden), [skills]);

  const filterCounts = useMemo(
    () => ({
      all: visibleSkills.length,
      active: visibleSkills.filter((skill) => skill.isEnabled).length,
      inactive: visibleSkills.filter((skill) => !skill.isEnabled).length,
      official: visibleSkills.filter((skill) => skill.source === 'official').length,
    }),
    [visibleSkills],
  );

  const filteredSkills = useMemo(() => {
    let result = visibleSkills;

    if (filter === 'active') {
      result = result.filter((skill) => skill.isEnabled);
    } else if (filter === 'inactive') {
      result = result.filter((skill) => !skill.isEnabled);
    } else if (filter === 'official') {
      result = result.filter((skill) => skill.source === 'official');
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (skill) =>
          skill.name.toLowerCase().includes(query) ||
          skill.description.toLowerCase().includes(query) ||
          skill.command.toLowerCase().includes(query),
      );
    }

    return result;
  }, [filter, searchQuery, visibleSkills]);

  const checkScrollPosition = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const threshold = 5;
    setIsAtBottom(element.scrollHeight - element.scrollTop - element.clientHeight < threshold);
  }, []);

  useEffect(() => {
    checkScrollPosition();
  }, [filteredSkills, checkScrollPosition]);

  const handleToggle = useCallback(
    async (id: string) => {
      const skill = skills.find((entry) => entry.id === id);
      if (!skill || !window.electronAPI?.setSkillEnabled) return;

      try {
        const updatedSkills = await window.electronAPI.setSkillEnabled(id, !skill.isEnabled);
        setSkills(updatedSkills);
      } catch (err) {
        console.error('Failed to toggle skill:', err);
      }
    },
    [skills],
  );

  const handleEdit = useCallback(async (filePath: string) => {
    if (!window.electronAPI?.openSkillInEditor) return;
    try {
      await window.electronAPI.openSkillInEditor(filePath);
    } catch (err) {
      console.error('Failed to open skill in editor:', err);
    }
  }, []);

  const handleShowInFolder = useCallback(async (filePath: string) => {
    if (!window.electronAPI?.showSkillInFolder) return;
    try {
      await window.electronAPI.showSkillInFolder(filePath);
    } catch (err) {
      console.error('Failed to show skill in folder:', err);
    }
  }, []);

  const handleResync = useCallback(async () => {
    if (!window.electronAPI?.resyncSkills || isResyncing) return;
    setIsResyncing(true);
    try {
      const [updatedSkills] = await Promise.all([
        window.electronAPI.resyncSkills(),
        new Promise((resolve) => setTimeout(resolve, 450)),
      ]);
      setSkills(updatedSkills);
    } catch (err) {
      console.error('Failed to refresh skills:', err);
    } finally {
      setIsResyncing(false);
    }
  }, [isResyncing]);

  const filterLabel =
    filter === 'all'
      ? 'All'
      : filter === 'active'
        ? 'Active'
        : filter === 'inactive'
          ? 'Inactive'
          : 'By Excelor';

  if (loading) {
    return (
      <div className="flex h-[480px] items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading skills...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="mb-4 flex gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-[150px] items-center justify-between gap-1.5 rounded-lg border border-border bg-[var(--bg-secondary)] px-3 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-[var(--bg-elevated)]">
              <div className="flex items-center gap-1.5">
                <svg
                  className="h-3.5 w-3.5 text-muted-foreground"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
                </svg>
                {filterLabel}
              </div>
              <svg
                className="h-3 w-3 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[180px]">
            <DropdownMenuItem onClick={() => setFilter('all')} className="flex justify-between">
              All <span className="text-muted-foreground">{filterCounts.all}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilter('active')} className="flex justify-between">
              Active <span className="text-muted-foreground">{filterCounts.active}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setFilter('inactive')}
              className="flex justify-between"
            >
              Inactive <span className="text-muted-foreground">{filterCounts.inactive}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setFilter('official')}
              className="flex justify-between"
            >
              By Excelor <span className="text-muted-foreground">{filterCounts.official}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <Input
            type="text"
            placeholder="Search skills..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-9"
          />
        </div>

        <motion.button
          onClick={handleResync}
          disabled={isResyncing}
          className="flex items-center justify-center rounded-lg border border-border bg-[var(--bg-secondary)] p-2 text-muted-foreground transition-colors hover:bg-[var(--bg-elevated)] hover:text-foreground disabled:opacity-50"
          title="Refresh skills"
          whileTap={{ scale: 0.9 }}
        >
          <motion.div
            animate={isResyncing ? { rotate: 720 } : { rotate: 0 }}
            transition={
              isResyncing ? { duration: 1, repeat: Infinity, ease: 'linear' } : { duration: 0 }
            }
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </motion.div>
        </motion.button>
      </div>

      <div
        ref={scrollRef}
        onScroll={checkScrollPosition}
        className="max-h-[480px] overflow-y-auto pr-1"
      >
        <div className="grid grid-cols-2 gap-3">
          <AnimatePresence mode="popLayout">
            {filteredSkills.map((skill, index) => (
              <motion.div
                key={skill.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{
                  layout: { duration: 0.2 },
                  opacity: { duration: 0.15 },
                  scale: { duration: 0.15 },
                  delay: index * 0.02,
                }}
              >
                <SkillCard
                  skill={skill}
                  onToggle={handleToggle}
                  onEdit={handleEdit}
                  onShowInFolder={handleShowInFolder}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {filteredSkills.length === 0 && (
            <motion.div
              className="flex h-[340px] items-center justify-center text-sm text-muted-foreground"
              variants={settingsVariants.fadeSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={settingsTransitions.enter}
            >
              No skills found
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
