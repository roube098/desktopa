import { useState, useCallback, useMemo, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Skill, SkillTreeNode } from '../types/skills';
import { Input } from './ui/input';
import { settingsVariants } from '../lib/animations';
import { SkillDetail } from './SkillDetail';

interface SkillsPanelProps {
  refreshTrigger?: number;
}

export function SkillsPanel({ refreshTrigger }: SkillsPanelProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillTrees, setSkillTrees] = useState<Record<string, SkillTreeNode | null>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [isResyncing, setIsResyncing] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const loadSkills = useCallback(async () => {
    if (!window.electronAPI?.getSkills) {
      setLoading(false);
      return;
    }

    try {
      const data = await window.electronAPI.getSkills();
      setSkills(data || []);
      if (data && data.length > 0 && !selectedSkillId) {
        const visible = data.filter((s: Skill) => !s.isHidden);
        if (visible.length > 0) {
          const firstSkill = visible[0];
          setSelectedSkillId((prev) => prev || firstSkill.id);
          setSelectedFilePath((prev) => prev || firstSkill.filePath);
          setExpandedSkills((prev) => new Set([...prev, firstSkill.id]));
        }
      }
    } catch (err) {
      console.error('Failed to load skills:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedSkillId]);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills, refreshTrigger]);

  useEffect(() => {
    if (!window.electronAPI?.onSkillsChanged) return;
    const unsubscribe = window.electronAPI.onSkillsChanged(() => {
      void loadSkills();
    });
    return unsubscribe;
  }, [loadSkills]);

  const visibleSkills = useMemo(() => skills.filter((skill) => !skill.isHidden), [skills]);

  const filteredSkills = useMemo(() => {
    let result = visibleSkills;

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
  }, [searchQuery, visibleSkills]);

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
      setSkillTrees({});
    } catch (err) {
      console.error('Failed to refresh skills:', err);
    } finally {
      setIsResyncing(false);
    }
  }, [isResyncing]);

  const loadSkillTree = useCallback(async (skillId: string) => {
    if (!window.electronAPI?.getSkillTree) return;
    if (skillTrees[skillId]) return;
    try {
      const tree = await window.electronAPI.getSkillTree(skillId);
      setSkillTrees((prev) => ({ ...prev, [skillId]: tree }));
    } catch (err) {
      console.error('Failed to load skill tree:', err);
      setSkillTrees((prev) => ({ ...prev, [skillId]: null }));
    }
  }, [skillTrees]);

  useEffect(() => {
    if (!selectedSkillId) return;
    void loadSkillTree(selectedSkillId);
  }, [selectedSkillId, loadSkillTree]);

  const toggleSkillExpanded = useCallback((skillId: string) => {
    setExpandedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) {
        next.delete(skillId);
      } else {
        next.add(skillId);
      }
      return next;
    });
  }, []);

  const toggleFolderExpanded = useCallback((folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  }, []);

  const handleSelectSkill = useCallback((skill: Skill) => {
    setSelectedSkillId(skill.id);
    setSelectedFilePath(skill.filePath);
    setExpandedSkills((prev) => new Set([...prev, skill.id]));
  }, []);

  const renderTreeNode = useCallback((node: SkillTreeNode, depth: number) => {
    const isFolder = node.type === 'folder';
    const isExpanded = isFolder && expandedFolders.has(node.path);
    const isSelectedFile = !isFolder && selectedFilePath === node.path;
    const hasChildren = isFolder && node.children.length > 0;
    const indent = 18 + depth * 14;

    return (
      <div key={node.path}>
        <button
          type="button"
          onClick={() => {
            if (isFolder) {
              toggleFolderExpanded(node.path);
              return;
            }
            setSelectedFilePath(node.path);
          }}
          className={`settings-resource-tree-btn px-2.5 py-[5px] text-left ${isSelectedFile ? 'settings-resource-tree-btn--selected' : ''}`}
          style={{
            paddingLeft: `${indent}px`,
            color: isSelectedFile ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          {isFolder ? (
            <>
              <svg
                className={`w-3 h-3 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <svg className="w-[13px] h-[13px] shrink-0 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </>
          ) : (
            <>
              <span className="w-3 shrink-0" />
              <svg className="w-[13px] h-[13px] shrink-0 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </>
          )}
          <span className="truncate text-[12.5px]">{node.name}</span>
          {isFolder && hasChildren && (
            <span className="ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>{node.children.length}</span>
          )}
        </button>

        {isFolder && isExpanded && hasChildren && (
          <div>
            {node.children.map((childNode) => renderTreeNode(childNode, depth + 1))}
          </div>
        )}
      </div>
    );
  }, [expandedFolders, selectedFilePath, toggleFolderExpanded]);

  const selectedSkill = useMemo(
    () => skills.find((s) => s.id === selectedSkillId) || filteredSkills[0],
    [skills, selectedSkillId, filteredSkills]
  );

  if (loading) {
    return (
      <div className="flex h-[480px] w-full items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading skills...</div>
      </div>
    );
  }

  return (
    <div className="settings-resource-split">
      <div className="settings-resource-sidebar">
        <div className="px-3 pt-3.5 pb-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-semibold tracking-wide uppercase select-none" style={{ color: 'var(--text-muted)' }}>Skills</span>
            <div className="flex items-center gap-0.5">
               <button 
                 onClick={() => setIsSearchOpen(!isSearchOpen)}
                 className="p-1.5 transition-colors rounded-md"
                 style={{ color: 'var(--text-muted)' }}
                 title="Search skills"
                 onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                 onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
               >
                 <svg className="w-[14px] h-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                   <circle cx="11" cy="11" r="8" />
                   <path d="M21 21l-4.35-4.35" />
                 </svg>
               </button>
               <button 
                 onClick={handleResync}
                 disabled={isResyncing}
                 className="p-1.5 transition-colors rounded-md disabled:opacity-50"
                 style={{ color: 'var(--text-muted)' }}
                 title="Refresh skills"
                 onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                 onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
               >
                  <div className={isResyncing ? "animate-spin" : ""}>
                    <svg className="w-[14px] h-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 4v6h-6" />
                      <path d="M1 20v-6h6" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                  </div>
               </button>
            </div>
          </div>
          
          <AnimatePresence>
            {isSearchOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden mb-2"
              >
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <Input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="pl-8 h-7 text-[12px]"
                    style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    autoFocus
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-2 flex items-center gap-1.5 cursor-default select-none" style={{ color: 'var(--text-muted)' }}>
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            Personal skills
          </div>
        </div>

        <div className="settings-resource-list scrollbar-thin">
           <AnimatePresence mode="popLayout">
              {filteredSkills.map((skill, index) => {
                 const isSelected = selectedSkillId === skill.id;
                 const isExpanded = expandedSkills.has(skill.id);
                 const tree = skillTrees[skill.id];
                 return (
                    <motion.div
                      key={skill.id}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.15, delay: index * 0.02 }}
                    >
                      <div
                        className={`settings-resource-row ${isSelected ? 'settings-resource-row--selected' : ''}`}
                        style={{
                          color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            toggleSkillExpanded(skill.id);
                            void loadSkillTree(skill.id);
                          }}
                          className="p-0.5 shrink-0 transition-colors"
                          style={{ color: 'inherit' }}
                          title={isExpanded ? 'Collapse' : 'Expand'}
                        >
                          <svg
                            className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSelectSkill(skill)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <svg className="h-[14px] w-[14px] shrink-0 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                          </svg>
                          <span className="truncate text-[13px]">{skill.name}</span>
                        </button>

                        <span
                          className={`settings-resource-row-status connector-status-text ${skill.isEnabled ? 'connected' : 'disconnected'}`}
                        >
                          <span className={`connector-status-dot ${skill.isEnabled ? 'connected' : 'disconnected'}`} />
                          {skill.isEnabled ? 'On' : 'Off'}
                        </span>

                        <button
                          type="button"
                          className={`connector-toggle shrink-0 ${skill.isEnabled ? 'enabled' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleToggle(skill.id);
                          }}
                          title={skill.isEnabled ? 'Disable skill' : 'Enable skill'}
                          aria-pressed={skill.isEnabled}
                        >
                          <span className={`connector-toggle-thumb ${skill.isEnabled ? 'enabled' : ''}`} />
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="mt-0.5">
                          {tree ? (
                            tree.children.map((node) => renderTreeNode(node, 0))
                          ) : (
                            <div className="pl-10 py-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>Loading...</div>
                          )}
                        </div>
                      )}
                    </motion.div>
                 );
              })}
           </AnimatePresence>

           {filteredSkills.length === 0 && (
             <div className="text-center text-[12px] mt-8" style={{ color: 'var(--text-muted)' }}>
               No skills found
             </div>
           )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden h-full relative z-0" style={{ background: 'var(--bg-primary)' }}>
         <AnimatePresence mode="wait">
            {selectedSkill ? (
               <SkillDetail 
                  key={selectedSkill.id}
                  skill={selectedSkill}
                  selectedFilePath={selectedFilePath || selectedSkill.filePath}
                  onToggle={handleToggle}
                  onEdit={handleEdit}
                  onShowInFolder={handleShowInFolder}
               />
            ) : (
               <motion.div
                 variants={settingsVariants.fadeSlide}
                 initial="initial"
                 animate="animate"
                 exit="exit"
                 className="flex h-full items-center justify-center text-[13px]"
                 style={{ color: 'var(--text-muted)' }}
               >
                 Select a skill to view details
               </motion.div>
            )}
         </AnimatePresence>
      </div>
    </div>
  );
}
