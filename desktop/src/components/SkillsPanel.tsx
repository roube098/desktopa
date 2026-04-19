import { useState, useCallback, useMemo, useEffect } from 'react';
import type { Skill, SkillScope } from '../types/skills';
import type { FileTreeNode } from '../types/tree';
import { SkillDetail } from './SkillDetail';
import { SettingsResourceBrowser } from './settings/SettingsResourceBrowser';
import { SkillListRowMeta } from './SkillListRowMeta';
import { SkillsEmptyState } from './SkillsEmptyState';
import { hasBrandColor, normalizeScope } from '../lib/skill-view-helpers';

interface SkillsPanelProps {
  refreshTrigger?: number;
}

export function SkillsPanel({ refreshTrigger }: SkillsPanelProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillTrees, setSkillTrees] = useState<Record<string, FileTreeNode | null>>({});
  const [loading, setLoading] = useState(true);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [isResyncing, setIsResyncing] = useState(false);
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [scopeFilter, setScopeFilter] = useState<'all' | SkillScope>('all');

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

  useEffect(() => {
    if (!window.electronAPI?.onSkillsUpdateAvailable) return;
    const unsubscribe = window.electronAPI.onSkillsUpdateAvailable(() => {
      void loadSkills();
    });
    return unsubscribe;
  }, [loadSkills]);

  const visibleSkills = useMemo(() => {
    const base = skills.filter((skill) => !skill.isHidden);
    if (scopeFilter === 'all') return base;
    return base.filter((s) => normalizeScope(s) === scopeFilter);
  }, [skills, scopeFilter]);

  const filterItems = useCallback((list: Skill[], query: string) => {
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(
      (skill) =>
        skill.name.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q) ||
        skill.command.toLowerCase().includes(q) ||
        skill.interface?.shortDescription?.toLowerCase().includes(q) ||
        (skill.scope ?? '').toLowerCase().includes(q) ||
        normalizeScope(skill).toLowerCase().includes(q),
    );
  }, []);

  const scopePills: { id: 'all' | SkillScope; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'user', label: 'User' },
    { id: 'repo', label: 'Repo' },
    { id: 'system', label: 'System' },
    { id: 'admin', label: 'Admin' },
  ];

  const listHeader = (
    <div className="skill-scope-filter" role="tablist" aria-label="Filter by skill scope">
      {scopePills.map((pill) => {
        const active = scopeFilter === pill.id;
        return (
          <button
            key={pill.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`skill-scope-filter-pill ${active ? 'skill-scope-filter-pill--active' : ''}`}
            onClick={() => setScopeFilter(pill.id)}
          >
            {pill.label}
          </button>
        );
      })}
    </div>
  );

  const loadingSlot = (
    <div className="settings-resource-loading-skeleton-wrap">
      <div className="settings-resource-loading-skeleton-toolbar" />
      <div className="settings-resource-loading-skeleton-search" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="settings-resource-loading-skeleton-row">
          <div className="settings-resource-loading-skeleton-chevron" />
          <div className="settings-resource-loading-skeleton-text">
            <div className="settings-resource-loading-skeleton-line settings-resource-loading-skeleton-line--title" />
            <div className="settings-resource-loading-skeleton-line settings-resource-loading-skeleton-line--meta" />
          </div>
        </div>
      ))}
    </div>
  );

  const emptyListSlot =
    scopeFilter === 'all' ? (
      <SkillsEmptyState />
    ) : (
      <div className="skill-settings-empty-scope">
        <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
          No skills in this scope. Try another filter or <strong>All</strong>.
        </p>
      </div>
    );

  const getRowStyle = useCallback((skill: Skill) => {
    if (!hasBrandColor(skill)) return undefined;
    const hex = skill.interface!.brandColor!.trim();
    return {
      boxShadow: `inset 3px 0 0 ${hex}`,
    };
  }, []);

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

  const loadSkillTree = useCallback(
    async (skillId: string) => {
      if (!window.electronAPI?.getSkillTree) return;
      if (skillTrees[skillId]) return;
      try {
        const tree = await window.electronAPI.getSkillTree(skillId);
        setSkillTrees((prev) => ({ ...prev, [skillId]: tree as FileTreeNode | null }));
      } catch (err) {
        console.error('Failed to load skill tree:', err);
        setSkillTrees((prev) => ({ ...prev, [skillId]: null }));
      }
    },
    [skillTrees],
  );

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

  const selectedSkill = useMemo(() => {
    const picked = skills.find((s) => s.id === selectedSkillId && !s.isHidden);
    return picked ?? visibleSkills[0];
  }, [skills, selectedSkillId, visibleSkills]);

  return (
    <SettingsResourceBrowser<Skill>
      items={visibleSkills}
      isLoading={loading}
      loadingMessage="Loading skills…"
      loadingSlot={loadingSlot}
      emptyListMessage="No skills found"
      emptyListSlot={emptyListSlot}
      noSearchResultsMessage="No skills match"
      listHeader={listHeader}
      getRowId={(s) => s.id}
      getItemLabel={(s) => s.interface?.displayName || s.name}
      getToggleKey={(s) => s.id}
      isItemEnabled={(s) => s.isEnabled}
      onToggle={(id) => void handleToggle(id)}
      selectedItemId={selectedSkillId}
      selectedItem={selectedSkill}
      onSelectItem={handleSelectSkill}
      selectedFilePath={selectedFilePath}
      onSelectFilePath={setSelectedFilePath}
      filterItems={filterItems}
      trees={skillTrees}
      onRequestTree={(id) => void loadSkillTree(id)}
      expandedRowIds={expandedSkills}
      onToggleRowExpanded={toggleSkillExpanded}
      expandedFolders={expandedFolders}
      onToggleFolder={toggleFolderExpanded}
      onResync={handleResync}
      isResyncing={isResyncing}
      toolbarTitle="Skills"
      sectionEyebrow="Personal skills"
      searchPlaceholder="Search skills…"
      resyncTitle="Refresh skills from disk"
      toggleEnabledLabel="Enable skill"
      toggleDisabledLabel="Disable skill"
      getRowStyle={getRowStyle}
      rowMeta={(skill) => <SkillListRowMeta skill={skill} />}
      renderDetail={(skill) => (
        <SkillDetail
          key={skill.id}
          skill={skill}
          selectedFilePath={selectedFilePath || skill.filePath}
          onToggle={handleToggle}
          onEdit={handleEdit}
          onShowInFolder={handleShowInFolder}
        />
      )}
      emptyDetailMessage="Select a skill to view details"
    />
  );
}
