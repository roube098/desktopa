import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Input } from '../ui/input';
import { settingsVariants } from '../../lib/animations';
import { FileTreeOutline } from './FileTreeOutline';
import type { FileTreeNode } from '../../types/tree';

export interface SettingsResourceBrowserProps<T> {
  items: T[];
  isLoading: boolean;
  loadingMessage: string;
  emptyListMessage: string;

  getRowId: (item: T) => string;
  getItemLabel: (item: T) => string;
  getToggleKey: (item: T) => string;
  isItemEnabled: (item: T) => boolean;
  onToggle: (toggleKey: string) => void;

  selectedItemId: string | null;
  selectedItem: T | undefined;
  onSelectItem: (item: T) => void;

  selectedFilePath: string | null;
  onSelectFilePath: (path: string) => void;

  filterItems: (items: T[], query: string) => T[];

  trees: Record<string, { children: FileTreeNode[] } | null>;
  onRequestTree: (rowId: string) => void;

  expandedRowIds: ReadonlySet<string>;
  onToggleRowExpanded: (rowId: string) => void;

  expandedFolders: ReadonlySet<string>;
  onToggleFolder: (path: string) => void;

  onResync: () => void;
  isResyncing: boolean;

  toolbarTitle: string;
  sectionEyebrow: string;
  searchPlaceholder?: string;
  resyncTitle?: string;

  renderDetail: (item: T) => ReactNode;
  emptyDetailMessage: string;

  /** Optional secondary line in each row (e.g. command, source). */
  rowMeta?: (item: T) => ReactNode;
  /** Optional per-row style (e.g. brand-color inset accent on the list row). */
  getRowStyle?: (item: T) => CSSProperties | undefined;
  /** Rendered above the search box (e.g. scope filter pills). */
  listHeader?: ReactNode;
  /** Replaces the default centered loading text when provided. */
  loadingSlot?: ReactNode;
  /** When the list is empty (no items at all), use this instead of `emptyListMessage`. */
  emptyListSlot?: ReactNode;
  /** When search filters out all items but the underlying list is non-empty. */
  noSearchResultsMessage?: string;
  toggleEnabledLabel: string;
  toggleDisabledLabel: string;
}

export function SettingsResourceBrowser<T>({
  items,
  isLoading,
  loadingMessage,
  emptyListMessage,
  getRowId,
  getItemLabel,
  getToggleKey,
  isItemEnabled,
  onToggle,
  selectedItemId,
  selectedItem,
  onSelectItem,
  selectedFilePath,
  onSelectFilePath,
  filterItems,
  trees,
  onRequestTree,
  expandedRowIds,
  onToggleRowExpanded,
  expandedFolders,
  onToggleFolder,
  onResync,
  isResyncing,
  toolbarTitle,
  sectionEyebrow,
  searchPlaceholder = 'Search…',
  resyncTitle = 'Refresh list',
  renderDetail,
  emptyDetailMessage,
  rowMeta,
  getRowStyle,
  listHeader,
  loadingSlot,
  emptyListSlot,
  noSearchResultsMessage = 'No items match',
  toggleEnabledLabel,
  toggleDisabledLabel,
}: SettingsResourceBrowserProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredItems = useMemo(
    () => filterItems(items, searchQuery),
    [items, searchQuery, filterItems],
  );

  if (isLoading) {
    return (
      <div className="settings-resource-loading">
        {loadingSlot ?? <div className="settings-resource-loading-text">{loadingMessage}</div>}
      </div>
    );
  }

  return (
    <div className="settings-resource-split">
      <div className="settings-resource-sidebar">
        <div className="settings-resource-sidebar-inner">
          <div className="settings-resource-toolbar">
            <span className="settings-resource-toolbar-title">{toolbarTitle}</span>
            <button
              type="button"
              className="settings-resource-icon-btn"
              onClick={() => onResync()}
              disabled={isResyncing}
              title={resyncTitle}
            >
              <span className={isResyncing ? 'settings-resource-icon-btn-spin' : ''}>
                <svg className="w-[14px] h-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 4v6h-6" />
                  <path d="M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </span>
            </button>
          </div>

          {listHeader ? <div className="settings-resource-list-header">{listHeader}</div> : null}

          <div className="settings-resource-search-wrap">
            <svg
              className="settings-resource-search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <Input
              type="search"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="settings-resource-search-input pl-8 h-8 text-[12px]"
              autoComplete="off"
            />
          </div>

          <div className="settings-resource-section-eyebrow">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            {sectionEyebrow}
          </div>
        </div>

        <div className="settings-resource-list scrollbar-thin">
          <AnimatePresence mode="popLayout">
            {filteredItems.map((item, index) => {
              const id = getRowId(item);
              const isSelected = selectedItemId === id;
              const isExpanded = expandedRowIds.has(id);
              const tree = trees[id];
              const enabled = isItemEnabled(item);

              return (
                <motion.div
                  key={id}
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
                      ...(getRowStyle?.(item) as CSSProperties | undefined),
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onToggleRowExpanded(id);
                        onRequestTree(id);
                      }}
                      className="settings-resource-chevron p-0.5 shrink-0 transition-colors"
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
                      onClick={() => onSelectItem(item)}
                      className="settings-resource-row-main flex min-w-0 flex-1 flex-col gap-0.5 text-left"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <svg
                          className="h-[14px] w-[14px] shrink-0 opacity-50"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                        <span className="truncate text-[13px] font-medium">{getItemLabel(item)}</span>
                      </span>
                      {rowMeta?.(item) ? (
                        <span className="settings-resource-row-meta pl-[22px]">{rowMeta(item)}</span>
                      ) : null}
                    </button>

                    <span
                      className={`settings-resource-row-status connector-status-text ${enabled ? 'connected' : 'disconnected'}`}
                    >
                      <span className={`connector-status-dot ${enabled ? 'connected' : 'disconnected'}`} />
                      {enabled ? 'On' : 'Off'}
                    </span>

                    <button
                      type="button"
                      className={`connector-toggle shrink-0 ${enabled ? 'enabled' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggle(getToggleKey(item));
                      }}
                      title={enabled ? toggleDisabledLabel : toggleEnabledLabel}
                      aria-pressed={enabled}
                    >
                      <span className={`connector-toggle-thumb ${enabled ? 'enabled' : ''}`} />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="settings-resource-tree-nest">
                      {tree ? (
                        <FileTreeOutline
                          nodes={tree.children}
                          expandedFolders={expandedFolders}
                          onToggleFolder={onToggleFolder}
                          selectedFilePath={selectedFilePath}
                          onSelectFile={onSelectFilePath}
                        />
                      ) : (
                        <div className="settings-resource-tree-loading">Loading…</div>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>

          {filteredItems.length === 0 && (
            <div className="settings-resource-empty-list">
              {items.length > 0 && searchQuery.trim()
                ? `${noSearchResultsMessage} “${searchQuery.trim()}”.`
                : emptyListSlot ?? emptyListMessage}
            </div>
          )}
        </div>
      </div>

      <div className="settings-resource-detail">
        <AnimatePresence mode="wait">
          {selectedItem ? (
            renderDetail(selectedItem)
          ) : (
            <motion.div
              variants={settingsVariants.fadeSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              className="settings-resource-empty-detail"
            >
              {emptyDetailMessage}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
