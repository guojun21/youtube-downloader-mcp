/**
 * MCP tool definition: youtube_list
 * Why: thin wrapper — a single tool for listing any YouTube content collection
 * (channel tabs, playlists, search results). All logic lives in the core service.
 */

import { coerceValueToTrimmedString } from "../core/youtube_video_id_extractor_utility.js";
import {
  formatSuccessResultAsJsonContent,
  formatErrorResultAsTextContent,
} from "../core/mcp_result_formatting_helpers.js";
import { listYoutubeContent } from "../core/youtube_channel_video_list_service.js";

export const definition = {
  name: "youtube_channel_videos",
  description:
    "List all videos from a YouTube channel or playlist. Returns video metadata (title, URL, views, upload date, duration) without downloading.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description:
          "YouTube channel or playlist URL. Accepted formats: /@username, /channel/UCxxx, /c/name, /playlist?list=PLxxx.",
      },
      limit: {
        type: "number",
        description:
          "Max number of videos to return (optional, default: all). Videos are returned newest first.",
      },
    },
    required: ["url"],
  },
};

export async function handler(args = {}) {
  const searchQuery = coerceValueToTrimmedString(args.search || args.query || args.keyword) || "";
  const urlInput = coerceValueToTrimmedString(args.url || args.channel_url || args.channelUrl) || "";

  // Why: if search is provided, construct a ytsearch: prefix URL for yt-dlp
  let resolvedUrl = urlInput;
  if (!resolvedUrl && searchQuery) {
    const limit = args.limit != null ? Math.floor(Number(args.limit)) : 20;
    resolvedUrl = `ytsearch${limit}:${searchQuery}`;
  }

  if (!resolvedUrl) {
    return formatErrorResultAsTextContent("Missing url or search query.");
  }

  const limit = args.limit != null ? Number(args.limit) : null;

  try {
    const result = listYoutubeContent({ url: resolvedUrl, limit });
    return formatSuccessResultAsJsonContent(result);
  } catch (error) {
    return formatErrorResultAsTextContent(error.message);
  }
}
