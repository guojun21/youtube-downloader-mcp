/**
 * Why: download orchestration logic (spawning yt-dlp, parsing progress, managing lifecycle)
 * must be shared between MCP tools and Electron IPC handlers — this service centralizes it.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import {
  insertNewTaskRecord,
  getTaskDatabaseFilePath,
  getCurrentIsoTimestamp,
  updateExistingTaskRecord,
} from "./download_task_persistent_json_store.js";
import {
  registerActiveTaskRuntimeState,
  removeActiveTaskRuntimeState,
} from "./download_task_runtime_state_tracker.js";
import {
  ensureYtDlpIsInstalledOrAutoInstall,
  buildVideoDownloadCommandArguments,
} from "./yt_dlp_command_argument_builder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOWNLOAD_LOG_DIRECTORY_PATH = path.resolve(__dirname, "..", "..", "logs");

function generateUniqueTaskIdentifier() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `task_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function ensureDirectoryExistsRecursively(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

/**
 * Why: yt-dlp outputs progress in a specific format with percentages, speeds, and ETAs;
 * parsing each line lets us update the task store with real-time download progress.
 */
export function parseYtDlpProgressOutputLine(rawLine) {
  const trimmedLine = rawLine.trim();
  if (!trimmedLine) return null;

  const progressPatch = { last_line: trimmedLine };

  const destinationFileMatch = trimmedLine.match(/Destination:\s+(.+)$/);
  if (destinationFileMatch) {
    const destinationFilePath = destinationFileMatch[1].trim();
    progressPatch.file_path = destinationFilePath;
    progressPatch.file_name = path.basename(destinationFilePath);
  }

  if (trimmedLine.includes("has already been downloaded")) {
    progressPatch.status = "completed";
    progressPatch.percentage = 100;
  }

  const percentageMatch = trimmedLine.match(/\b(\d+(?:\.\d+)?)%\b/);
  if (trimmedLine.startsWith("[download]") && percentageMatch) {
    const parsedPercent = Math.min(100, Number(percentageMatch[1]));
    progressPatch.status = "downloading";
    progressPatch.percentage = Number.isFinite(parsedPercent)
      ? Math.round(parsedPercent * 10) / 10
      : null;
  }

  const downloadSpeedMatch = trimmedLine.match(/\bat\s+([^\s]+\/s)\b/);
  if (downloadSpeedMatch) {
    progressPatch.speed = downloadSpeedMatch[1];
  }

  const estimatedTimeMatch = trimmedLine.match(/\bETA\s+([0-9:]+|Unknown)\b/i);
  if (estimatedTimeMatch) {
    progressPatch.eta = estimatedTimeMatch[1];
  }

  if (trimmedLine.startsWith("ERROR:") || trimmedLine.includes("Error:")) {
    progressPatch.status = "failed";
    progressPatch.error = trimmedLine.replace(/^ERROR:\s*/i, "");
  }

  return progressPatch;
}

/**
 * Starts a background yt-dlp download process and returns the task record immediately.
 * Progress is tracked via the task store and runtime tracker.
 */
export function startBackgroundVideoDownloadTask({
  videoId,
  sourceUrl,
  outputDirectoryPath,
  downloadFormat = "best[ext=mp4]/best",
}) {
  ensureDirectoryExistsRecursively(outputDirectoryPath);
  ensureDirectoryExistsRecursively(DOWNLOAD_LOG_DIRECTORY_PATH);
  ensureYtDlpIsInstalledOrAutoInstall();

  const taskId = generateUniqueTaskIdentifier();
  const createdAtTimestamp = getCurrentIsoTimestamp();
  const taskLogFilePath = path.join(DOWNLOAD_LOG_DIRECTORY_PATH, `${taskId}.log`);

  const taskRecord = {
    id: taskId,
    type: "download",
    video_id: videoId,
    source_url: sourceUrl,
    format: downloadFormat,
    output_path: outputDirectoryPath,
    status: "starting",
    percentage: 0,
    speed: null,
    eta: null,
    file_name: null,
    file_path: null,
    error: null,
    log_path: taskLogFilePath,
    pid: null,
    last_line: null,
    created_at: createdAtTimestamp,
    updated_at: createdAtTimestamp,
    finished_at: null,
  };

  insertNewTaskRecord(taskRecord);

  const outputFileTemplate = path.join(outputDirectoryPath, "%(title)s [%(id)s].%(ext)s");
  const ytDlpCommandArgs = buildVideoDownloadCommandArguments({
    url: sourceUrl,
    outputTemplate: outputFileTemplate,
    format: downloadFormat,
  });

  const childProcess = spawn("python3", ytDlpCommandArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const runtimeState = registerActiveTaskRuntimeState(taskId, {
    pid: childProcess.pid,
    process: childProcess,
    log_path: taskLogFilePath,
    started_at: createdAtTimestamp,
  });

  updateExistingTaskRecord(taskId, {
    status: "running",
    pid: childProcess.pid,
  });

  // Why: batch progress updates to avoid excessive disk writes (max 1 per second)
  let pendingProgressPatch = null;
  let lastDiskPersistTimestamp = 0;

  const persistProgressPatchToDisk = (patch, forceImmediately = false) => {
    if (!patch) return;
    pendingProgressPatch = { ...(pendingProgressPatch || {}), ...patch };
    const currentTime = Date.now();
    if (!forceImmediately && currentTime - lastDiskPersistTimestamp < 1000) return;
    const finalizedPatch = pendingProgressPatch;
    pendingProgressPatch = null;
    lastDiskPersistTimestamp = currentTime;
    updateExistingTaskRecord(taskId, finalizedPatch);
  };

  const processOutputLine = (line) => {
    if (!line) return;
    fs.appendFileSync(taskLogFilePath, `${line}\n`, "utf-8");
    const progressPatch = parseYtDlpProgressOutputLine(line);
    if (progressPatch) persistProgressPatchToDisk(progressPatch);
  };

  const attachStreamLineHandler = (readableStream) => {
    let incompleteLineBuffer = "";
    readableStream.on("data", (chunk) => {
      incompleteLineBuffer += chunk.toString();
      const completedLines = incompleteLineBuffer.split(/\r?\n/);
      incompleteLineBuffer = completedLines.pop() || "";
      for (const line of completedLines) {
        processOutputLine(line);
      }
    });
    readableStream.on("end", () => {
      if (incompleteLineBuffer.trim()) processOutputLine(incompleteLineBuffer.trim());
    });
  };

  attachStreamLineHandler(childProcess.stdout);
  attachStreamLineHandler(childProcess.stderr);

  childProcess.on("error", (error) => {
    persistProgressPatchToDisk({ status: "failed", error: error.message }, true);
    removeActiveTaskRuntimeState(taskId);
  });

  childProcess.on("close", (exitCode) => {
    const finishedAtTimestamp = getCurrentIsoTimestamp();
    const finalStatus = exitCode === 0 ? "completed" : "failed";
    const completionPatch = {
      status: finalStatus,
      finished_at: finishedAtTimestamp,
      exit_code: exitCode,
    };
    if (finalStatus === "completed") {
      completionPatch.percentage = 100;
    }
    persistProgressPatchToDisk(completionPatch, true);
    removeActiveTaskRuntimeState(taskId);
  });

  return {
    taskId,
    videoId,
    status: "running",
    outputPath: taskRecord.output_path,
    format: downloadFormat,
    logPath: taskLogFilePath,
    pid: runtimeState?.pid || null,
    dbPath: getTaskDatabaseFilePath(),
  };
}
