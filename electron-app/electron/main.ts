/**
 * Electron main process.
 * Why: replaces the .NET backend entirely — imports yt-dlp core modules directly
 * and exposes them to the renderer via IPC handlers.
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { createRequire } from 'module';

// Why: Electron's main process uses CommonJS; we use createRequire to import ES modules
const require = createRequire(import.meta.url);

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
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e',
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainApplicationWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainApplicationWindow.webContents.openDevTools();
  } else {
    mainApplicationWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainApplicationWindow.on('closed', () => {
    mainApplicationWindow = null;
  });
}

// Why: dynamic import() works for ES modules from CJS/Electron main process
async function importCoreModule(moduleName: string) {
  const corePath = path.resolve(__dirname, '../../lib/core', moduleName);
  return await import(corePath);
}

function registerIpcHandlersForYoutubeOperations() {
  ipcMain.handle('youtube:search', async (_event, query: string) => {
    // Why: yt-dlp doesn't have a search API like YoutubeExplode did;
    // we use yt-dlp's search functionality instead
    const { spawnSync } = await import('child_process');
    const ytDlpBuilder = await importCoreModule('yt_dlp_command_argument_builder.js');
    ytDlpBuilder.ensureYtDlpIsInstalledOrAutoInstall();

    const searchArgs = [
      '-m', 'yt_dlp', '--no-color', '--dump-json',
      '--flat-playlist', '--no-download',
      `ytsearch10:${query}`
    ];

    const result = spawnSync('python3', searchArgs, {
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
  });

  ipcMain.handle('youtube:getOptions', async (_event, videoId: string) => {
    // Why: yt-dlp can list available formats with --dump-json
    const { spawnSync } = await import('child_process');
    const ytDlpBuilder = await importCoreModule('yt_dlp_command_argument_builder.js');
    ytDlpBuilder.ensureYtDlpIsInstalledOrAutoInstall();

    const infoArgs = [
      '-m', 'yt_dlp', '--no-color', '--dump-json',
      '--no-download', `https://www.youtube.com/watch?v=${videoId}`
    ];

    const result = spawnSync('python3', infoArgs, {
      encoding: 'utf8',
      timeout: 30000,
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

    // Why: deduplicate and return a manageable list of common format options
    const PREFERRED_FORMAT_OPTIONS = [
      { container: 'mp4', quality: '1080p', size: '' },
      { container: 'mp4', quality: '720p', size: '' },
      { container: 'mp4', quality: '480p', size: '' },
      { container: 'mp4', quality: '360p', size: '' },
      { container: 'mp3', quality: 'Audio only', size: '' },
    ];

    return formats.length > 0 ? formats.slice(0, 15) : PREFERRED_FORMAT_OPTIONS;
  });

  ipcMain.handle(
    'youtube:startDownload',
    async (_event, videoId: string, container: string, quality: string) => {
      const downloaderService = await importCoreModule('youtube_video_downloader_service.js');
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      const { getDefaultVideoOutputDirectoryPath } = await importCoreModule(
        'youtube_video_id_extractor_utility.js'
      );

      const result = downloaderService.startBackgroundVideoDownloadTask({
        videoId,
        sourceUrl: videoUrl,
        outputDirectoryPath: getDefaultVideoOutputDirectoryPath(),
        downloadFormat: container === 'mp3'
          ? 'bestaudio/best'
          : `best[ext=${container}]/best[ext=mp4]/best`,
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
