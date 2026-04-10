import { useState, useCallback, useMemo, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { DesktopPlugin, PluginTreeNode } from '../types/plugins';
import { Input } from './ui/input';
import { PluginDetail } from './PluginDetail';

export function PluginsPanel() {
  const [plugins, setPlugins] = useState<DesktopPlugin[]>([]);
  const [pluginTrees, setPluginTrees] = useState<Record<string, PluginTreeNode | null>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [isResyncing, setIsResyncing] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [expandedPlugins, setExpandedPlugins] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const loadPlugins = useCallback(async () => {
    if (!window.electronAPI?.getPlugins) {
      setLoading(false);
      return;
    }

    try {
      const data = await window.electronAPI.getPlugins();
      setPlugins(data || []);
      if (data && data.length > 0 && !selectedPluginId) {
        const firstPlugin = data[0];
        setSelectedPluginId((prev) => prev || firstPlugin.id);
        setSelectedFilePath((prev) => prev || firstPlugin.filePath || firstPlugin.manifestPath || firstPlugin.path);
        setExpandedPlugins((prev) => new Set([...prev, firstPlugin.id]));
      }
    } catch (err) {
      console.error('Failed to load plugins:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedPluginId]);

  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  const filteredPlugins = useMemo(() => {
    let result = plugins;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (plugin) =>
          plugin.name.toLowerCase().includes(query) ||
          plugin.description.toLowerCase().includes(query) ||
          plugin.source.toLowerCase().includes(query) ||
          plugin.scopes.some((scope) => scope.toLowerCase().includes(query)),
      );
    }

    return result;
  }, [plugins, searchQuery]);

  const handleToggle = useCallback(
    async (pluginName: string) => {
      const plugin = plugins.find((entry) => entry.name === pluginName);
      if (!plugin || !window.electronAPI?.setPluginEnabled) return;

      try {
        const updatedPlugins = await window.electronAPI.setPluginEnabled(pluginName, !plugin.isEnabled);
        setPlugins(updatedPlugins);
      } catch (err) {
        console.error('Failed to toggle plugin:', err);
      }
    },
    [plugins],
  );

  const handleEdit = useCallback(async (filePath: string) => {
    if (!window.electronAPI?.openPluginInEditor) return;
    try {
      await window.electronAPI.openPluginInEditor(filePath);
    } catch (err) {
      console.error('Failed to open plugin file in editor:', err);
    }
  }, []);

  const handleShowInFolder = useCallback(async (filePath: string) => {
    if (!window.electronAPI?.showPluginInFolder) return;
    try {
      await window.electronAPI.showPluginInFolder(filePath);
    } catch (err) {
      console.error('Failed to show plugin in folder:', err);
    }
  }, []);

  const handleResync = useCallback(async () => {
    if (!window.electronAPI?.resyncPlugins || isResyncing) return;
    setIsResyncing(true);
    try {
      const [updatedPlugins] = await Promise.all([
        window.electronAPI.resyncPlugins(),
        new Promise((resolve) => setTimeout(resolve, 450)),
      ]);
      setPlugins(updatedPlugins);
      setPluginTrees({});
    } catch (err) {
      console.error('Failed to refresh plugins:', err);
    } finally {
      setIsResyncing(false);
    }
  }, [isResyncing]);

  const loadPluginTree = useCallback(async (pluginId: string) => {
    if (!window.electronAPI?.getPluginTree) return;
    if (pluginTrees[pluginId]) return;
    try {
      const tree = await window.electronAPI.getPluginTree(pluginId);
      setPluginTrees((prev) => ({ ...prev, [pluginId]: tree }));
    } catch (err) {
      console.error('Failed to load plugin tree:', err);
      setPluginTrees((prev) => ({ ...prev, [pluginId]: null }));
    }
  }, [pluginTrees]);

  useEffect(() => {
    if (!selectedPluginId) return;
    void loadPluginTree(selectedPluginId);
  }, [selectedPluginId, loadPluginTree]);

  const togglePluginExpanded = useCallback((pluginId: string) => {
    setExpandedPlugins((prev) => {
      const next = new Set(prev);
      if (next.has(pluginId)) {
        next.delete(pluginId);
      } else {
        next.add(pluginId);
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

  const handleSelectPlugin = useCallback((plugin: DesktopPlugin) => {
    setSelectedPluginId(plugin.id);
    setSelectedFilePath(plugin.filePath || plugin.manifestPath || plugin.path);
    setExpandedPlugins((prev) => new Set([...prev, plugin.id]));
  }, []);

  const renderTreeNode = useCallback((node: PluginTreeNode, depth: number) => {
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

  const selectedPlugin = useMemo(
    () => plugins.find((plugin) => plugin.id === selectedPluginId) || filteredPlugins[0],
    [plugins, selectedPluginId, filteredPlugins]
  );

  if (loading) {
    return (
      <div className="flex h-[480px] w-full items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading plugins...</div>
      </div>
    );
  }

  return (
    <div className="settings-resource-split">
      <div className="settings-resource-sidebar">
        <div className="px-3 pt-3.5 pb-2">
          <AnimatePresence>
            {isSearchOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
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
            Installed plugins
          </div>
        </div>

        <div className="settings-resource-list scrollbar-thin">
          <AnimatePresence mode="popLayout">
            {filteredPlugins.map((plugin, index) => {
              const isSelected = selectedPluginId === plugin.id;
              const isExpanded = expandedPlugins.has(plugin.id);
              const tree = pluginTrees[plugin.id];
              return (
                <motion.div
                  key={plugin.id}
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
                        togglePluginExpanded(plugin.id);
                        void loadPluginTree(plugin.id);
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
                      onClick={() => handleSelectPlugin(plugin)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <svg className="h-[14px] w-[14px] shrink-0 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                      <span className="truncate text-[13px]">{plugin.name}</span>
                    </button>

                    <span
                      className={`settings-resource-row-status connector-status-text ${plugin.isEnabled ? 'connected' : 'disconnected'}`}
                    >
                      <span className={`connector-status-dot ${plugin.isEnabled ? 'connected' : 'disconnected'}`} />
                      {plugin.isEnabled ? 'On' : 'Off'}
                    </span>

                    <button
                      type="button"
                      className={`connector-toggle shrink-0 ${plugin.isEnabled ? 'enabled' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleToggle(plugin.name);
                      }}
                      title={plugin.isEnabled ? 'Disable plugin' : 'Enable plugin'}
                      aria-pressed={plugin.isEnabled}
                    >
                      <span className={`connector-toggle-thumb ${plugin.isEnabled ? 'enabled' : ''}`} />
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

          {filteredPlugins.length === 0 && (
            <div className="text-center text-[12px] mt-8" style={{ color: 'var(--text-muted)' }}>
              No plugins found
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden h-full relative z-0 ml-2" style={{ background: 'var(--bg-primary)' }}>
        <AnimatePresence mode="wait">
          {selectedPlugin ? (
            <PluginDetail
              key={selectedPlugin.id}
              plugin={selectedPlugin}
              selectedFilePath={selectedFilePath || selectedPlugin.filePath || selectedPlugin.manifestPath || selectedPlugin.path}
              onToggle={handleToggle}
              onEdit={handleEdit}
              onShowInFolder={handleShowInFolder}
            />
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex h-full items-center justify-center text-[13px]"
              style={{ color: 'var(--text-muted)' }}
            >
              Select a plugin to view details
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
