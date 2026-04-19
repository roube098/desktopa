import { useState, useCallback, useMemo, useEffect } from 'react';
import type { DesktopPlugin } from '../types/plugins';
import type { FileTreeNode } from '../types/tree';
import { PluginDetail } from './PluginDetail';
import { SettingsResourceBrowser } from './settings/SettingsResourceBrowser';

export function PluginsPanel() {
  const [plugins, setPlugins] = useState<DesktopPlugin[]>([]);
  const [pluginTrees, setPluginTrees] = useState<Record<string, FileTreeNode | null>>({});
  const [loading, setLoading] = useState(true);
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [isResyncing, setIsResyncing] = useState(false);
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

  const filterItems = useCallback((list: DesktopPlugin[], query: string) => {
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(
      (plugin) =>
        plugin.name.toLowerCase().includes(q) ||
        plugin.description.toLowerCase().includes(q) ||
        plugin.source.toLowerCase().includes(q) ||
        plugin.scopes.some((scope) => scope.toLowerCase().includes(q)),
    );
  }, []);

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

  const loadPluginTree = useCallback(
    async (pluginId: string) => {
      if (!window.electronAPI?.getPluginTree) return;
      if (pluginTrees[pluginId]) return;
      try {
        const tree = await window.electronAPI.getPluginTree(pluginId);
        setPluginTrees((prev) => ({ ...prev, [pluginId]: tree as FileTreeNode | null }));
      } catch (err) {
        console.error('Failed to load plugin tree:', err);
        setPluginTrees((prev) => ({ ...prev, [pluginId]: null }));
      }
    },
    [pluginTrees],
  );

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

  const selectedPlugin = useMemo(() => {
    return plugins.find((p) => p.id === selectedPluginId) ?? plugins[0];
  }, [plugins, selectedPluginId]);

  return (
    <SettingsResourceBrowser<DesktopPlugin>
      items={plugins}
      isLoading={loading}
      loadingMessage="Loading plugins…"
      emptyListMessage="No plugins found"
      getRowId={(p) => p.id}
      getItemLabel={(p) => p.name}
      getToggleKey={(p) => p.name}
      isItemEnabled={(p) => p.isEnabled}
      onToggle={(name) => void handleToggle(name)}
      selectedItemId={selectedPluginId}
      selectedItem={selectedPlugin}
      onSelectItem={handleSelectPlugin}
      selectedFilePath={selectedFilePath}
      onSelectFilePath={setSelectedFilePath}
      filterItems={filterItems}
      trees={pluginTrees}
      onRequestTree={(id) => void loadPluginTree(id)}
      expandedRowIds={expandedPlugins}
      onToggleRowExpanded={togglePluginExpanded}
      expandedFolders={expandedFolders}
      onToggleFolder={toggleFolderExpanded}
      onResync={handleResync}
      isResyncing={isResyncing}
      toolbarTitle="Plugins"
      sectionEyebrow="Installed plugins"
      searchPlaceholder="Search plugins…"
      resyncTitle="Rescan plugins folder"
      toggleEnabledLabel="Enable plugin"
      toggleDisabledLabel="Disable plugin"
      rowMeta={(plugin) => (
        <span className="text-[11px] capitalize text-[color:var(--text-muted)]">{plugin.source}</span>
      )}
      renderDetail={(plugin) => (
        <PluginDetail
          key={plugin.id}
          plugin={plugin}
          selectedFilePath={selectedFilePath || plugin.filePath || plugin.manifestPath || plugin.path}
          onToggle={handleToggle}
          onEdit={handleEdit}
          onShowInFolder={handleShowInFolder}
        />
      )}
      emptyDetailMessage="Select a plugin to view details"
    />
  );
}
