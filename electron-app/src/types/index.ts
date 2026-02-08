export interface YoutubeVideoSearchResultInfo {
  id: string;
  title: string;
  author: string;
  duration: string;
  thumbnailUrl: string;
}

export interface YoutubeVideoSearchApiResponse {
  kind: string;
  title: string;
  videos: YoutubeVideoSearchResultInfo[];
}

export interface VideoDownloadFormatOption {
  container: string;
  quality: string;
  size: string;
}

export interface VideoDownloadProgressSnapshot {
  status: string;
  percentage: number;
  fileName?: string;
  filePath?: string;
  error?: string;
}

export interface ActiveVideoDownloadItem {
  id: string;
  downloadId: string;
  video: YoutubeVideoSearchResultInfo;
  option: VideoDownloadFormatOption;
  progress: VideoDownloadProgressSnapshot;
}

/**
 * Why: declaring the electronAPI shape on the Window type enables
 * TypeScript type-checking for IPC calls in the renderer process.
 */
declare global {
  interface Window {
    electronAPI?: {
      searchVideos: (query: string) => Promise<YoutubeVideoSearchApiResponse>;
      getDownloadOptions: (videoId: string) => Promise<VideoDownloadFormatOption[]>;
      startDownload: (
        videoId: string,
        container: string,
        quality: string
      ) => Promise<string>;
      getDownloadProgress: (downloadId: string) => Promise<VideoDownloadProgressSnapshot>;
    };
  }
}
