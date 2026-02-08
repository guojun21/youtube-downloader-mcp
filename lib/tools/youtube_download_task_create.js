/**
 * MCP tool definition: youtube_download
 * Why: thin wrapper — all download logic lives in the core service.
 */

import {
  coerceValueToTrimmedString,
  extractYoutubeVideoIdFromUrlOrRawInput,
  resolveOutputDirectoryFromUserInput,
} from "../core/youtube_video_id_extractor_utility.js";
import {
  formatSuccessResultAsJsonContent,
  formatErrorResultAsTextContent,
} from "../core/mcp_result_formatting_helpers.js";
import { startBackgroundVideoDownloadTask } from "../core/youtube_video_downloader_service.js";

export const definition = {
  name: "youtube_download",
  description:
    "Download a YouTube video to a specified directory. Downloads start immediately in background.",
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

  // Why: when the user provides an explicit output_path, use it directly;
  // when not provided, pass null so the download service creates a timestamped subfolder.
  const outputPathRaw = coerceValueToTrimmedString(
    args.output_path || args.outputPath || args.output_dir || args.outputDir
  );
  const outputDirectoryPath = outputPathRaw
    ? resolveOutputDirectoryFromUserInput(outputPathRaw)
    : null;

  const resolvedUrl = urlInput || `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const result = startBackgroundVideoDownloadTask({
      videoId,
      sourceUrl: resolvedUrl,
      outputDirectoryPath,
    });
    return formatSuccessResultAsJsonContent({ success: true, ...result });
  } catch (error) {
    return formatErrorResultAsTextContent(error.message);
  }
}
