/**
 * Why: contextBridge exposes a safe API from the main process to the renderer,
 * replacing the old HTTP-based API client with direct IPC calls.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  searchVideos: (query: string) => ipcRenderer.invoke('youtube:search', query),
  getDownloadOptions: (videoId: string) => ipcRenderer.invoke('youtube:getOptions', videoId),
  startDownload: (videoId: string, container: string, quality: string) =>
    ipcRenderer.invoke('youtube:startDownload', videoId, container, quality),
  getDownloadProgress: (downloadId: string) =>
    ipcRenderer.invoke('youtube:getProgress', downloadId),
  getTaskHistory: (typeFilter?: string) =>
    ipcRenderer.invoke('youtube:getTaskHistory', typeFilter),
  downloadSubtitle: (videoId: string, language: string) =>
    ipcRenderer.invoke('youtube:downloadSubtitle', videoId, language),
  startTranscription: (videoId: string, language: string, model?: string) =>
    ipcRenderer.invoke('youtube:transcribe', videoId, language, model),
});
