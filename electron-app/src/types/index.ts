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

export interface TaskHistoryRecord {
  id: string;
  type: 'download' | 'subtitle' | 'transcription';
  video_id?: string;
  video_file_path?: string;
  source_url?: string;
  status: string;
  output_path: string;
  created_at: string;
  finished_at: string | null;
  file_name?: string | null;
  file_path?: string | null;
  language?: string | null;
  detected_language?: string | null;
  model?: string | null;
  subtitle_path?: string | null;
  transcript_path?: string | null;
  error?: string | null;
  percentage?: number;
  elapsed_seconds?: number | null;
}

export interface SubtitleDownloadResult {
  success: boolean;
  taskId: string;
  videoId: string;
  status: string;
  message?: string;
  error?: string;
  language?: string;
  subtitlePath?: string;
  transcriptPath?: string;
  transcriptLength?: number;
  outputPath?: string;
}

export interface TranscriptionStartResult {
  success: boolean;
  taskId?: string;
  videoFilePath?: string;
  transcriptPath?: string;
  language?: string;
  model?: string;
  status?: string;
  logPath?: string;
  pid?: number | null;
  error?: string;
}

declare global {
  interface Window {
    electronAPI?: {
      searchVideos: (query: string) => Promise<YoutubeVideoSearchApiResponse>;
      getDownloadOptions: (videoId: string) => Promise<VideoDownloadFormatOption[]>;
      startDownload: (videoId: string, container: string, quality: string) => Promise<string>;
      getDownloadProgress: (downloadId: string) => Promise<VideoDownloadProgressSnapshot>;
      getTaskHistory: (typeFilter?: string) => Promise<TaskHistoryRecord[]>;
      downloadSubtitle: (videoId: string, language: string) => Promise<SubtitleDownloadResult>;
      startTranscription: (videoId: string, language: string, model?: string) => Promise<TranscriptionStartResult>;
    };
  }
}
