/**
 * MCP tool definition: youtube_subtitle
 * Why: thin wrapper — all subtitle logic lives in the core service.
 */

import {
  coerceValueToTrimmedString,
  extractYoutubeVideoIdFromUrlOrRawInput,
  resolveOutputDirectoryFromUserInput,
  getDefaultVideoOutputDirectoryPath,
} from "../core/youtube_video_id_extractor_utility.js";
import {
  formatSuccessResultAsJsonContent,
  formatErrorResultAsTextContent,
} from "../core/mcp_result_formatting_helpers.js";
import { downloadSubtitlesAndGenerateTranscript } from "../core/youtube_subtitle_downloader_service.js";

export const definition = {
  name: "youtube_subtitle",
  description:
    "Download subtitles/transcript for a YouTube video. Downloads SRT and converts to plain text. Returns clear message if no subtitles available.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "YouTube video URL.",
      },
      output_path: {
        type: "string",
        description: "Output directory path (optional, default youtubevideos/).",
      },
      language: {
        type: "string",
        description:
          "Subtitle language codes, comma-separated (default 'en-orig,en'). Examples: 'zh-Hans', 'ja', 'en-orig,en'.",
      },
    },
    required: ["url"],
  },
};

export async function handler(args = {}) {
  const urlInput =
    coerceValueToTrimmedString(args.url || args.video_url || args.videoUrl) || "";
  const videoId = extractYoutubeVideoIdFromUrlOrRawInput(urlInput);

  if (!videoId) {
    return formatErrorResultAsTextContent("Missing or invalid url.");
  }

  const requestedLanguage = coerceValueToTrimmedString(args.language) || "en-orig,en";
  const outputPathRaw = coerceValueToTrimmedString(
    args.output_path || args.outputPath || args.output_dir
  );
  const outputDirectoryPath = outputPathRaw
    ? resolveOutputDirectoryFromUserInput(outputPathRaw)
    : getDefaultVideoOutputDirectoryPath();

  const resolvedUrl = urlInput || `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const result = downloadSubtitlesAndGenerateTranscript({
      videoId,
      sourceUrl: resolvedUrl,
      outputDirectoryPath,
      requestedLanguage,
    });

    if (!result.success) {
      return formatSuccessResultAsJsonContent({
        success: false,
        task_id: result.taskId,
        video_id: result.videoId,
        status: result.status,
        message: result.message || result.error,
      });
    }

    return formatSuccessResultAsJsonContent({
      success: true,
      task_id: result.taskId,
      video_id: result.videoId,
      status: result.status,
      language: result.language,
      subtitle_path: result.subtitlePath,
      transcript_path: result.transcriptPath,
      transcript_length: result.transcriptLength,
      output_path: result.outputPath,
    });
  } catch (error) {
    return formatErrorResultAsTextContent(error.message);
  }
}
