/**
 * Why: extracts the download progress polling loop from App.tsx so the
 * main component stays slim. Polls every 1s for active downloads.
 */
import { useEffect, useCallback } from 'react';
import { youtubeDownloaderApiClient } from '../api/youtube';
import type { ActiveVideoDownloadItem } from '../types';

export function useDownloadPoller(
  activeDownloads: ActiveVideoDownloadItem[],
  setActiveDownloads: React.Dispatch<React.SetStateAction<ActiveVideoDownloadItem[]>>,
) {
  const pollProgress = useCallback(async () => {
    const inProgress = activeDownloads.filter(
      (d) => d.progress.status !== 'Completed' && d.progress.status !== 'Failed',
    );
    for (const dl of inProgress) {
      try {
        const progress = await youtubeDownloaderApiClient.getDownloadProgressByTrackingId(dl.downloadId);
        setActiveDownloads((prev) =>
          prev.map((d) => (d.id === dl.id ? { ...d, progress } : d)),
        );
      } catch {
        /* Why: transient polling errors should not disrupt the UI */
      }
    }
  }, [activeDownloads, setActiveDownloads]);

  useEffect(() => {
    const interval = setInterval(pollProgress, 1000);
    return () => clearInterval(interval);
  }, [pollProgress]);
}
