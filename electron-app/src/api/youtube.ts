/**
 * YouTube API client for the Electron renderer process.
 * Why: uses IPC via window.electronAPI (exposed by preload.ts) instead of HTTP.
 */

import type {
  YoutubeVideoSearchApiResponse,
  VideoDownloadFormatOption,
  VideoDownloadProgressSnapshot,
  TaskHistoryRecord,
  SubtitleDownloadResult,
  TranscriptionStartResult,
} from '../types';

function getElectronApiOrThrow() {
  if (!window.electronAPI) {
    throw new Error('Electron API not available. Are you running inside the Electron app?');
  }
  return window.electronAPI;
}

export const youtubeDownloaderApiClient = {
  async searchVideosByQuery(searchQuery: string): Promise<YoutubeVideoSearchApiResponse> {
    return await getElectronApiOrThrow().searchVideos(searchQuery);
  },

  async getAvailableDownloadOptionsForVideo(videoId: string): Promise<VideoDownloadFormatOption[]> {
    return await getElectronApiOrThrow().getDownloadOptions(videoId);
  },

  async startVideoDownloadTask(videoId: string, containerFormat: string, qualityLabel: string): Promise<string> {
    return await getElectronApiOrThrow().startDownload(videoId, containerFormat, qualityLabel);
  },

  async getDownloadProgressByTrackingId(downloadTrackingId: string): Promise<VideoDownloadProgressSnapshot> {
    return await getElectronApiOrThrow().getDownloadProgress(downloadTrackingId);
  },

  async getTaskHistory(typeFilter?: string): Promise<TaskHistoryRecord[]> {
    return await getElectronApiOrThrow().getTaskHistory(typeFilter);
  },

  async downloadSubtitle(videoId: string, language: string): Promise<SubtitleDownloadResult> {
    return await getElectronApiOrThrow().downloadSubtitle(videoId, language);
  },

  async startTranscription(videoId: string, language: string, model?: string): Promise<TranscriptionStartResult> {
    return await getElectronApiOrThrow().startTranscription(videoId, language, model);
  },
};
