/**
 * Electron main process.
 * Why: replaces the .NET backend entirely — imports yt-dlp core modules directly
 * and exposes them to the renderer via IPC handlers.
 *
 * Compiled to CommonJS by tsconfig.electron.json, so we use require() for
 * static Node.js modules and dynamic import() for the ES module core layer.
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { spawnSync } from 'child_process';

let mainApplicationWindow: BrowserWindow | null = null;

function createMainApplicationWindow() {
  mainApplicationWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e',
  });

  // Why: in dev mode, load from Vite dev server for HMR; in prod, load the built HTML
  const viteDevUrl = process.env.VITE_DEV_SERVER_URL;
  if (viteDevUrl) {
    mainApplicationWindow.loadURL(viteDevUrl);
  } else {
    mainApplicationWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Why: intercept new-window requests (e.g. target="_blank") to open in default browser
  mainApplicationWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  mainApplicationWindow.on('closed', () => {
    mainApplicationWindow = null;
  });
}

/**
 * Why: lib/core/ modules are ES modules (root package.json "type": "module"),
 * but Electron main is compiled to CJS. We use a CJS bridge file that calls
 * native import() with properly encoded file:// URLs (handles ! in paths).
 *
 * In dev mode: lib/core/ is at ../../lib/core/ relative to dist-electron/
 * In packaged app: extraResources puts it at process.resourcesPath/lib/core/
 */
function resolveCoreDirectory(): string {
  const devCorePath = path.resolve(__dirname, '..', '..', 'lib', 'core', 'bridge.cjs');
  try {
    require.resolve(devCorePath);
    return devCorePath;
  } catch {
    // Why: in packaged app, extraResources places lib/ under Resources/
    return path.join(process.resourcesPath, 'lib', 'core', 'bridge.cjs');
  }
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadCoreModule } = require(resolveCoreDirectory());

async function importCoreModule(moduleName: string) {
  return await loadCoreModule(moduleName);
}

/**
 * Why: yt-dlp search is not in the core services because MCP doesn't need a search tool;
 * only the Electron UI needs interactive search, so we inline it here.
 */
async function searchYoutubeVideosWithYtDlp(query: string) {
  // Why: ensure yt-dlp is available before attempting search
  const ytDlpBuilder = await importCoreModule('yt_dlp_command_argument_builder.js');
  ytDlpBuilder.ensureYtDlpIsInstalledOrAutoInstall();
  const ytDlpBin = ytDlpBuilder.getYtDlpBinaryPath();

  const searchArgs = [
    '--no-color', '--dump-json',
    '--flat-playlist', '--no-download',
    `ytsearch10:${query}`
  ];

  const result = spawnSync(ytDlpBin, searchArgs, {
    encoding: 'utf8',
    timeout: 30000,
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || 'Search failed');
  }

  const videos = result.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line: string) => {
      try {
        const data = JSON.parse(line);
        return {
          id: data.id || '',
          title: data.title || 'Unknown',
          author: data.uploader || data.channel || 'Unknown',
          duration: data.duration
            ? new Date(data.duration * 1000).toISOString().slice(11, 19)
            : 'N/A',
          thumbnailUrl: data.thumbnails?.[0]?.url || '',
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return {
    kind: 'Search',
    title: `Search: ${query}`,
    videos,
  };
}

async function getVideoFormatOptionsWithYtDlp(videoId: string) {
  const ytDlpBuilder = await importCoreModule('yt_dlp_command_argument_builder.js');
  ytDlpBuilder.ensureYtDlpIsInstalledOrAutoInstall();
  const ytDlpBin = ytDlpBuilder.getYtDlpBinaryPath();

  const infoArgs = [
    '--no-color', '--dump-json',
    '--no-download', `https://www.youtube.com/watch?v=${videoId}`
  ];

  const result = spawnSync(ytDlpBin, infoArgs, {
    encoding: 'utf8',
    timeout: 60000,
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || 'Failed to get video info');
  }

  const videoInfo = JSON.parse(result.stdout);
  const formats = (videoInfo.formats || [])
    .filter((f: any) => f.vcodec !== 'none' || f.acodec !== 'none')
    .map((f: any) => ({
      container: f.ext || 'mp4',
      quality: f.format_note || f.resolution || 'unknown',
      size: f.filesize
        ? `${(f.filesize / 1024 / 1024).toFixed(1)} MB`
        : f.filesize_approx
          ? `~${(f.filesize_approx / 1024 / 1024).toFixed(1)} MB`
          : 'N/A',
    }));

  // Why: if yt-dlp returned real formats, use them; otherwise provide common defaults
  const FALLBACK_FORMAT_OPTIONS = [
    { container: 'mp4', quality: '1080p', size: '' },
    { container: 'mp4', quality: '720p', size: '' },
    { container: 'mp4', quality: '480p', size: '' },
    { container: 'mp4', quality: '360p', size: '' },
    { container: 'mp3', quality: 'Audio only', size: '' },
  ];

  return formats.length > 0 ? formats.slice(0, 15) : FALLBACK_FORMAT_OPTIONS;
}

function registerIpcHandlersForYoutubeOperations() {
  ipcMain.handle('youtube:search', async (_event, query: string) => {
    return await searchYoutubeVideosWithYtDlp(query);
  });

  ipcMain.handle('youtube:getOptions', async (_event, videoId: string) => {
    return await getVideoFormatOptionsWithYtDlp(videoId);
  });

  ipcMain.handle(
    'youtube:startDownload',
    async (_event, videoId: string, container: string, _quality: string) => {
      const downloaderService = await importCoreModule('youtube_video_downloader_service.js');
      const idExtractor = await importCoreModule('youtube_video_id_extractor_utility.js');
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      // Why: YouTube serves video+audio as separate DASH streams; we must request
      // bestvideo+bestaudio and let yt-dlp/ffmpeg merge them. Falling back to 'best'
      // handles the rare case where only pre-muxed formats exist.
      let downloadFormat: string;
      if (container === 'mp3') {
        downloadFormat = 'bestaudio/best';
      } else if (container === 'mp4') {
        downloadFormat = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best';
      } else {
        downloadFormat = `bestvideo+bestaudio/best`;
      }

      // Why: pass null so the service creates a timestamped subfolder automatically
      const result = downloaderService.startBackgroundVideoDownloadTask({
        videoId,
        sourceUrl: videoUrl,
        outputDirectoryPath: null,
        downloadFormat,
      });

      return result.taskId;
    }
  );

  ipcMain.handle('youtube:getProgress', async (_event, downloadId: string) => {
    const taskStore = await importCoreModule('download_task_persistent_json_store.js');
    const task = taskStore.findTaskRecordById(downloadId);
    if (!task) {
      return { status: 'Unknown', percentage: 0 };
    }
    return {
      status: task.status === 'completed' ? 'Completed'
        : task.status === 'failed' ? 'Failed'
        : task.status === 'running' || task.status === 'downloading' ? 'Downloading'
        : 'Starting',
      percentage: task.percentage || 0,
      fileName: task.file_name || null,
      filePath: task.file_path || null,
      error: task.error || null,
    };
  });

  ipcMain.handle('youtube:getTaskHistory', async (_event, typeFilter?: string) => {
    const taskStore = await importCoreModule('download_task_persistent_json_store.js');
    let tasks = taskStore.retrieveAllTaskRecords();
    if (typeFilter) {
      tasks = tasks.filter((t: any) => t.type === typeFilter);
    }
    // Why: sort descending so newest tasks appear first
    tasks.sort((a: any, b: any) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      return tb - ta;
    });
    return tasks.slice(0, 100);
  });

  ipcMain.handle('youtube:downloadSubtitle', async (_event, videoId: string, language: string) => {
    const subtitleService = await importCoreModule('youtube_subtitle_downloader_service.js');
    const idExtractor = await importCoreModule('youtube_video_id_extractor_utility.js');
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    // Why: put subtitles in the existing video subfolder, or create a new timestamped one
    const outputDir = idExtractor.findExistingVideoSubdirectoryByVideoId(videoId)
      || idExtractor.createTimestampedVideoSubdirectory(videoId);
    const result = subtitleService.downloadSubtitlesAndGenerateTranscript({
      videoId,
      sourceUrl: videoUrl,
      outputDirectoryPath: outputDir,
      requestedLanguage: language || 'en-orig,en',
    });
    return result;
  });

  ipcMain.handle(
    'youtube:transcribe',
    async (_event, videoId: string, language: string, model?: string) => {
      const transcriptionService = await importCoreModule('video_transcription_service.js');
      const idExtractor = await importCoreModule('youtube_video_id_extractor_utility.js');

      // Why: search recursively under youtubevideos/ (handles both flat and subfolder layouts)
      const videoFilePath = idExtractor.findDownloadedVideoFileRecursively(videoId);

      if (!videoFilePath) {
        return {
          success: false,
          error: `No downloaded video found for ${videoId} under youtubevideos/. Download it first.`,
        };
      }

      const pathMod = require('path');
      try {
        const result = transcriptionService.startBackgroundTranscriptionTask({
          videoFilePath,
          outputDirectoryPath: pathMod.dirname(videoFilePath),
          language: language || 'auto',
          model: model || 'mlx-community/whisper-large-v3-turbo',
        });
        return { success: true, ...result };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );
}

app.whenReady().then(() => {
  registerIpcHandlersForYoutubeOperations();
  createMainApplicationWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainApplicationWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
