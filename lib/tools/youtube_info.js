/**
 * MCP tool definition: youtube_info
 * Why: thin wrapper — extracts rich metadata for a single video (chapters, comments,
 * sponsorblock, formats) without downloading. All logic lives in the core service.
 */

import {
  coerceValueToTrimmedString,
  extractYoutubeVideoIdFromUrlOrRawInput,
} from "../core/youtube_video_id_extractor_utility.js";
import {
  formatSuccessResultAsJsonContent,
  formatErrorResultAsTextContent,
} from "../core/mcp_result_formatting_helpers.js";
import { getVideoInfo } from "../core/youtube_video_info_service.js";

export const definition = {
  name: "youtube_info",
  description:
    "Get detailed metadata for a single YouTube video without downloading. " +
    "Returns title, description, chapters, tags, thumbnails, view/like counts, and channel info. " +
    "Optionally includes comments, SponsorBlock segments, and available formats.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "YouTube video URL.",
      },
      include_comments: {
        type: "boolean",
        description:
          "Include video comments (default false). Can be slow for popular videos.",
      },
      include_sponsorblock: {
        type: "boolean",
        description:
          "Include SponsorBlock segments showing sponsor/intro/outro timestamps (default false).",
      },
      include_formats: {
        type: "boolean",
        description:
          "Include list of available video/audio formats and qualities (default false).",
      },
    },
    required: ["url"],
  },
};

export async function handler(args = {}) {
  const urlInput = coerceValueToTrimmedString(args.url || args.video_url || args.videoUrl) || "";
  const videoId = extractYoutubeVideoIdFromUrlOrRawInput(urlInput);

  if (!videoId) {
    return formatErrorResultAsTextContent("Missing or invalid YouTube video URL.");
  }

  const resolvedUrl = urlInput || `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const result = getVideoInfo({
      url: resolvedUrl,
      includeComments: args.include_comments === true,
      includeSponsorBlock: args.include_sponsorblock === true,
      includeFormats: args.include_formats === true,
    });
    return formatSuccessResultAsJsonContent(result);
  } catch (error) {
    return formatErrorResultAsTextContent(error.message);
  }
}
