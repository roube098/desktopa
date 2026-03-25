import { useCallback, useEffect, useState } from 'react';

interface UseWorkspaceFilesResult {
  files: WorkspaceFile[];
  loading: boolean;
  error: string;
  refresh: (showLoading?: boolean) => Promise<void>;
}

export function useWorkspaceFiles(): UseWorkspaceFilesResult {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async (showLoading = true) => {
    if (!window.electronAPI?.listWorkspaceFiles) {
      setError('Electron API not available');
      setLoading(false);
      return;
    }

    if (showLoading) {
      setLoading(true);
    }

    try {
      const result = await window.electronAPI.listWorkspaceFiles();
      if (result.success) {
        setFiles(result.files);
        setError('');
      } else {
        setError(result.error || 'Failed to load files');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  useEffect(() => {
    if (!window.electronAPI?.onWorkspaceFilesChanged) return undefined;
    return window.electronAPI.onWorkspaceFilesChanged(() => {
      void refresh(false);
    });
  }, [refresh]);

  return {
    files,
    loading,
    error,
    refresh,
  };
}
