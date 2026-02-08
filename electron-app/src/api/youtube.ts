/**
 * YouTube API client for the Electron renderer process.
 * Why: uses IPC via window.electronAPI (exposed by preload.ts) instead of HTTP,
 * which removes the dependency on a separate .NET backend server.
 */

import type {
  YoutubeVideoSearchApiResponse,
  VideoDownloadFormatOption,
  VideoDownloadProgressSnapshot,
} from '../types';

function getElectronApiOrThrow() {
  if (!window.electronAPI) {
    throw new Error(
      'Electron API not available. Are you running inside the Electron app?'
    );
  }
  return window.electronAPI;
}

export const youtubeDownloaderApiClient = {
  async searchVideosByQuery(
    searchQuery: string
  ): Promise<YoutubeVideoSearchApiResponse> {
    const electronApi = getElectronApiOrThrow();
    return await electronApi.searchVideos(searchQuery);
  },

  async getAvailableDownloadOptionsForVideo(
    videoId: string
  ): Promise<VideoDownloadFormatOption[]> {
    const electronApi = getElectronApiOrThrow();
    return await electronApi.getDownloadOptions(videoId);
  },

  async startVideoDownloadTask(
    videoId: string,
    containerFormat: string,
    qualityLabel: string
  ): Promise<string> {
    const electronApi = getElectronApiOrThrow();
    return await electronApi.startDownload(videoId, containerFormat, qualityLabel);
  },

  async getDownloadProgressByTrackingId(
    downloadTrackingId: string
  ): Promise<VideoDownloadProgressSnapshot> {
    const electronApi = getElectronApiOrThrow();
    return await electronApi.getDownloadProgress(downloadTrackingId);
  },
};
