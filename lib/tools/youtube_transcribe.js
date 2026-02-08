/**
 * MCP tool definition: youtube_transcribe
 * Why: thin wrapper — all transcription logic lives in the core service.
 * Supports both local file paths and YouTube URLs (downloads first, then transcribes).
 */

import fs from "fs";
import path from "path";
import {
  coerceValueToTrimmedString,
  extractYoutubeVideoIdFromUrlOrRawInput,
  resolveOutputDirectoryFromUserInput,
  findDownloadedVideoFileRecursively,
} from "../core/youtube_video_id_extractor_utility.js";
import {
  formatSuccessResultAsJsonContent,
  formatErrorResultAsTextContent,
} from "../core/mcp_result_formatting_helpers.js";
import { startBackgroundTranscriptionTask } from "../core/video_transcription_service.js";
import {
  findTaskRecordById,
} from "../core/download_task_persistent_json_store.js";

export const definition = {
  name: "youtube_transcribe",
  description:
    "Transcribe a YouTube video or local video/audio file using local mlx-whisper (Apple Silicon GPU). " +
    "If a YouTube URL is given and the video is already downloaded, it transcribes that file. " +
    "If a local file path is given, it transcribes directly. " +
    "Language is auto-detected from the filename (CJK heuristic) or Whisper auto-detection.",
  inputSchema: {
    type: "object",
    properties: {
      input: {
        type: "string",
        description:
          "YouTube URL or local file path to video/audio. " +
          "For YouTube URLs, the video must already be downloaded.",
      },
      language: {
        type: "string",
        description:
          "Language code (e.g. 'zh', 'en', 'ja', 'ko') or 'auto' for auto-detection. Default: 'auto'.",
      },
      model: {
        type: "string",
        description:
          "HuggingFace model name. Default: 'mlx-community/whisper-large-v3-turbo'.",
      },
      output_path: {
        type: "string",
        description: "Output directory for transcript files (optional, defaults to same directory as video).",
      },
    },
    required: ["input"],
  },
};

// Why: findDownloadedVideoFileRecursively is now in the shared utility module

export async function handler(args = {}) {
  const inputRaw = coerceValueToTrimmedString(args.input || args.url || args.file_path || args.filePath) || "";
  const language = coerceValueToTrimmedString(args.language) || "auto";
  const model = coerceValueToTrimmedString(args.model) || "mlx-community/whisper-large-v3-turbo";

  if (!inputRaw) {
    return formatErrorResultAsTextContent(
      "Missing 'input' parameter. Provide a YouTube URL or local file path."
    );
  }

  let videoFilePath = null;

  // Why: check if it's a local file path first (most direct)
  if (fs.existsSync(inputRaw)) {
    videoFilePath = path.resolve(inputRaw);
  } else {
    // Why: try to extract YouTube video ID and find the downloaded file (searches recursively)
    const videoId = extractYoutubeVideoIdFromUrlOrRawInput(inputRaw);
    if (videoId) {
      const outputPathRaw = coerceValueToTrimmedString(args.output_path || args.outputPath);
      const searchDir = outputPathRaw
        ? resolveOutputDirectoryFromUserInput(outputPathRaw)
        : null;

      videoFilePath = findDownloadedVideoFileRecursively(videoId, searchDir);
      if (!videoFilePath) {
        return formatErrorResultAsTextContent(
          `Video with ID '${videoId}' not found under youtubevideos/. ` +
          "Download it first with youtube_download, then try again."
        );
      }
    } else {
      return formatErrorResultAsTextContent(
        `Input '${inputRaw}' is neither a valid file path nor a YouTube URL.`
      );
    }
  }

  const outputPathRaw = coerceValueToTrimmedString(args.output_path || args.outputPath);
  const outputDirectoryPath = outputPathRaw
    ? resolveOutputDirectoryFromUserInput(outputPathRaw)
    : path.dirname(videoFilePath);

  try {
    const result = startBackgroundTranscriptionTask({
      videoFilePath,
      outputDirectoryPath,
      language,
      model,
    });
    return formatSuccessResultAsJsonContent({
      success: true,
      message: "Transcription started. Poll task status with youtube_task_list to check progress.",
      ...result,
    });
  } catch (error) {
    return formatErrorResultAsTextContent(error.message);
  }
}
