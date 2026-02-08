/**
 * Why: transcription orchestration (spawning Python mlx-whisper script, parsing progress,
 * tracking lifecycle) must be shared between MCP tools and Electron IPC handlers.
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRANSCRIPTION_LOG_DIRECTORY_PATH = path.resolve(__dirname, "..", "..", "logs");
const TRANSCRIPTION_PYTHON_SCRIPT_PATH = path.resolve(__dirname, "transcribe_audio.py");

/**
 * Why: the venv lives at project-root/.venv; we need its python3 binary
 * so mlx-whisper (and its native Metal deps) are available.
 */
function resolveVenvPythonBinaryPath() {
  const projectRootPath = path.resolve(__dirname, "..", "..");
  const venvPythonPath = path.join(projectRootPath, ".venv", "bin", "python3");
  if (fs.existsSync(venvPythonPath)) return venvPythonPath;
  // Why: fallback to system python3 if venv is missing (will likely fail on import)
  return "python3";
}

function generateUniqueTaskIdentifier() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `task_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function ensureDirectoryExistsRecursively(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

/**
 * Why: quick CJK/Korean/Japanese heuristic so we can hint the language to Whisper
 * before it processes 30s of audio for auto-detection.
 */
function detectLanguageFromFileName(fileName) {
  if (/[\u4e00-\u9fff]/.test(fileName)) return "zh";
  if (/[\uac00-\ud7af]/.test(fileName)) return "ko";
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(fileName)) return "ja";
  return "auto";
}

/**
 * Starts a background transcription process and returns the task record immediately.
 * The Python script outputs progress JSON to stderr; we parse it to update the task store.
 */
export function startBackgroundTranscriptionTask({
  videoFilePath,
  outputDirectoryPath,
  language = "auto",
  model = "mlx-community/whisper-large-v3-turbo",
}) {
  if (!fs.existsSync(videoFilePath)) {
    throw new Error(`Input video file not found: ${videoFilePath}`);
  }

  const resolvedOutputDir = outputDirectoryPath || path.dirname(videoFilePath);
  ensureDirectoryExistsRecursively(resolvedOutputDir);
  ensureDirectoryExistsRecursively(TRANSCRIPTION_LOG_DIRECTORY_PATH);

  const taskId = generateUniqueTaskIdentifier();
  const createdAtTimestamp = getCurrentIsoTimestamp();
  const taskLogFilePath = path.join(TRANSCRIPTION_LOG_DIRECTORY_PATH, `${taskId}.log`);

  // Why: determine output filename from video filename
  const videoBaseName = path.basename(videoFilePath, path.extname(videoFilePath));
  const transcriptOutputPath = path.join(resolvedOutputDir, `${videoBaseName}.txt`);

  // Why: auto-detect language from filename if not explicitly specified
  const resolvedLanguage = language === "auto"
    ? detectLanguageFromFileName(videoBaseName)
    : language;

  const taskRecord = {
    id: taskId,
    type: "transcription",
    video_file_path: videoFilePath,
    output_path: resolvedOutputDir,
    transcript_path: transcriptOutputPath,
    language: resolvedLanguage,
    model,
    status: "starting",
    percentage: 0,
    error: null,
    log_path: taskLogFilePath,
    pid: null,
    last_progress: null,
    created_at: createdAtTimestamp,
    updated_at: createdAtTimestamp,
    finished_at: null,
  };

  insertNewTaskRecord(taskRecord);

  const pythonBinaryPath = resolveVenvPythonBinaryPath();
  const pythonScriptArgs = [
    TRANSCRIPTION_PYTHON_SCRIPT_PATH,
    "--input", videoFilePath,
    "--output", transcriptOutputPath,
    "--language", resolvedLanguage,
    "--model", model,
  ];

  const childProcess = spawn(pythonBinaryPath, pythonScriptArgs, {
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

  /**
   * Why: the Python script emits JSON lines to stderr with progress updates;
   * we parse each line and update the task store so callers can poll status.
   */
  let stderrLineBuffer = "";
  childProcess.stderr.on("data", (chunk) => {
    stderrLineBuffer += chunk.toString();
    const completedLines = stderrLineBuffer.split(/\r?\n/);
    stderrLineBuffer = completedLines.pop() || "";

    for (const line of completedLines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Why: log everything for debugging
      fs.appendFileSync(taskLogFilePath, `[stderr] ${trimmedLine}\n`, "utf-8");

      // Why: try to parse JSON progress; non-JSON lines are just logged
      try {
        const progressData = JSON.parse(trimmedLine);
        const patch = {
          last_progress: progressData,
          percentage: Math.round((progressData.progress || 0) * 100),
        };
        if (progressData.status === "completed") {
          patch.status = "completed";
          patch.percentage = 100;
          patch.finished_at = getCurrentIsoTimestamp();
          patch.transcript_path = progressData.transcript_path || transcriptOutputPath;
          patch.detected_language = progressData.language;
          patch.elapsed_seconds = progressData.elapsed_seconds;
        } else if (progressData.status === "error") {
          patch.status = "failed";
          patch.error = progressData.error || "Unknown transcription error";
        }
        updateExistingTaskRecord(taskId, patch);
      } catch {
        // Why: not JSON — just a regular log line from Python/mlx
      }
    }
  });

  // Why: capture stdout (if any) for debug logging
  childProcess.stdout.on("data", (chunk) => {
    fs.appendFileSync(taskLogFilePath, `[stdout] ${chunk.toString()}`, "utf-8");
  });

  childProcess.on("error", (error) => {
    updateExistingTaskRecord(taskId, {
      status: "failed",
      error: error.message,
      finished_at: getCurrentIsoTimestamp(),
    });
    removeActiveTaskRuntimeState(taskId);
  });

  childProcess.on("close", (exitCode) => {
    const finishedAtTimestamp = getCurrentIsoTimestamp();

    // Why: only mark completed if exit 0 AND not already marked by progress handler
    if (exitCode === 0) {
      const currentTask = updateExistingTaskRecord(taskId, {
        finished_at: finishedAtTimestamp,
      });
      // Why: if status wasn't set to completed by progress parsing, do it now
      if (currentTask && currentTask.status !== "completed") {
        updateExistingTaskRecord(taskId, {
          status: "completed",
          percentage: 100,
        });
      }
    } else {
      updateExistingTaskRecord(taskId, {
        status: "failed",
        finished_at: finishedAtTimestamp,
        exit_code: exitCode,
      });
    }
    removeActiveTaskRuntimeState(taskId);
  });

  return {
    taskId,
    videoFilePath,
    transcriptPath: transcriptOutputPath,
    language: resolvedLanguage,
    model,
    status: "running",
    logPath: taskLogFilePath,
    pid: runtimeState?.pid || null,
    dbPath: getTaskDatabaseFilePath(),
  };
}
