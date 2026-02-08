/**
 * Why: extracts history-fetching side effect from App.tsx. Loads task
 * history whenever the history tab becomes active or the filter changes.
 */
import { useState, useEffect, useCallback } from 'react';
import { youtubeDownloaderApiClient } from '../api/youtube';
import type { TaskHistoryRecord } from '../types';

export function useHistoryLoader(isActive: boolean, typeFilter: string) {
  const [historyRecords, setHistoryRecords] = useState<TaskHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const filter = typeFilter === 'all' ? undefined : typeFilter;
      const records = await youtubeDownloaderApiClient.getTaskHistory(filter);
      setHistoryRecords(records);
    } catch {
      /* Why: silent fail for history — not critical */
    } finally {
      setIsLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    if (isActive) loadHistory();
  }, [isActive, loadHistory]);

  return { historyRecords, isLoading, refreshHistory: loadHistory };
}
