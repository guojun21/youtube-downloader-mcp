/**
 * Why: listing YouTube content (channel tabs, playlists, search results) requires parsing
 * yt-dlp's NDJSON output (one JSON object per line) from --flat-playlist --dump-json.
 * This service handles URL/search validation, yt-dlp execution, and structured result formatting.
 */

import { spawnSync } from "child_process";
import {
  ensureYtDlpIsInstalledOrAutoInstall,
  buildChannelVideoListCommandArguments,
  getYtDlpBinaryPath,
} from "./yt_dlp_command_argument_builder.js";
import { coerceValueToTrimmedString } from "./youtube_video_id_extractor_utility.js";

/**
 * Why: yt-dlp search prefixes (ytsearch:, ytsearchdate:) are not URLs but special
 * protocol-like strings that yt-dlp understands natively.
 */
const SEARCH_PREFIX_PATTERN = /^ytsearch(date)?(\d*):/i;

/**
 * Why: channel/playlist URLs follow specific path patterns that differ from single-video
 * URLs. We accept /@user (with any tab), /channel/, /c/, /user/, and /playlist?list= forms.
 */
const LISTABLE_YOUTUBE_URL_PATTERNS = [
  /\/@[^/]+/,                     // /@username or /@username/videos|shorts|live|playlists|community
  /\/channel\/UC[a-zA-Z0-9_-]+/,  // /channel/UCxxxxxx
  /\/c\/[^/]+/,                    // /c/channelname
  /\/user\/[^/]+/,                 // /user/username (legacy)
  /[?&]list=[A-Za-z0-9_-]+/,      // /playlist?list=PLxxxxxx
];

function isListableInput(url) {
  const trimmed = coerceValueToTrimmedString(url);
  if (!trimmed) return false;

  // Why: accept yt-dlp search prefixes directly
  if (SEARCH_PREFIX_PATTERN.test(trimmed)) return true;

  let parsedUrl;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return false;
  }

  const hostnameWithoutWww = parsedUrl.hostname.replace(/^www\./, "");
  const isYouTube = [
    "youtube.com",
    "m.youtube.com",
    "music.youtube.com",
  ].some((host) => hostnameWithoutWww === host);

  if (!isYouTube) return false;

  // Why: also accept youtube.com/results?search_query= as a search URL
  if (parsedUrl.pathname === "/results" && parsedUrl.searchParams.has("search_query")) {
    return true;
  }

  // Why: reject single-video URLs — the v= param without a list= param is a video
  if (parsedUrl.searchParams.has("v") && !parsedUrl.searchParams.has("list")) {
    return false;
  }

  const fullUrlString = parsedUrl.pathname + parsedUrl.search;
  return LISTABLE_YOUTUBE_URL_PATTERNS.some((pattern) => pattern.test(fullUrlString));
}

/**
 * Why: yt-dlp returns upload_date as "YYYYMMDD"; formatting to "YYYY-MM-DD" is more readable.
 */
function formatUploadDate(rawDate) {
  if (!rawDate || typeof rawDate !== "string" || rawDate.length !== 8) return rawDate || null;
  return `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
}

/**
 * Why: yt-dlp's --flat-playlist JSON includes many fields; we extract only the most
 * useful ones to keep the MCP response concise and readable.
 */
function extractVideoEntryFromRawJson(rawEntry) {
  const entry = {
    id: rawEntry.id || null,
    title: rawEntry.title || null,
    url: rawEntry.id ? `https://www.youtube.com/watch?v=${rawEntry.id}` : rawEntry.url || null,
    view_count: rawEntry.view_count ?? null,
    upload_date: formatUploadDate(rawEntry.upload_date),
    duration: rawEntry.duration ?? null,
    duration_string: rawEntry.duration_string || null,
  };

  if (rawEntry.description) {
    entry.description = rawEntry.description.length > 200
      ? rawEntry.description.slice(0, 200) + "..."
      : rawEntry.description;
  }

  return entry;
}

/**
 * Why: the first NDJSON entry from --flat-playlist contains playlist-level metadata
 * (playlist_title, uploader, etc.) that tells us which channel/playlist we're listing.
 */
function extractPlaylistMetadata(firstRawEntry) {
  return {
    playlist_title: firstRawEntry.playlist_title || firstRawEntry.playlist || null,
    channel: firstRawEntry.channel || firstRawEntry.uploader || null,
    channel_id: firstRawEntry.channel_id || firstRawEntry.uploader_id || null,
  };
}

/**
 * Lists YouTube content: channel tabs (videos/shorts/live/playlists/community),
 * playlists, or search results.
 * Runs synchronously — blocks until yt-dlp finishes enumerating.
 *
 * @param {Object} options
 * @param {string} options.url - Channel/playlist URL or yt-dlp search prefix (ytsearch:, ytsearchdate:)
 * @param {number|null} options.limit - Max number of items to return (null = all)
 * @returns {{ success: boolean, source: string, total_videos: number, videos: Array }}
 */
export function listYoutubeContent({ url, limit = null }) {
  ensureYtDlpIsInstalledOrAutoInstall();

  const trimmedUrl = coerceValueToTrimmedString(url);
  if (!trimmedUrl) {
    throw new Error("Missing or empty URL/search query.");
  }

  if (!isListableInput(trimmedUrl)) {
    throw new Error(
      "Input does not look like a listable YouTube source. " +
      "Expected: /@username, /@username/shorts, /@username/live, /@username/playlists, " +
      "/channel/UCxxx, /playlist?list=PLxxx, ytsearch:query, ytsearchdate:query. " +
      "For single videos, use youtube_download, youtube_subtitle, or youtube_info instead."
    );
  }

  const parsedLimit = limit && Number.isFinite(Number(limit)) && Number(limit) > 0
    ? Math.floor(Number(limit))
    : null;

  const args = buildChannelVideoListCommandArguments({
    url: trimmedUrl,
    playlistEnd: parsedLimit,
  });

  const result = spawnSync(getYtDlpBinaryPath(), args, {
    encoding: "utf8",
    timeout: 300000,
    maxBuffer: 100 * 1024 * 1024,
  });

  if (result.status !== 0 && !result.stdout) {
    const errorMessage = (result.stderr || result.stdout || "Unknown yt-dlp error").trim();
    throw new Error(`yt-dlp failed: ${errorMessage}`);
  }

  const stdoutContent = result.stdout || "";
  const lines = stdoutContent.split("\n").filter((line) => line.trim());

  const videos = [];
  let playlistMeta = null;
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (!playlistMeta) {
        playlistMeta = extractPlaylistMetadata(parsed);
      }
      videos.push(extractVideoEntryFromRawJson(parsed));
    } catch {
      // Why: skip non-JSON lines (yt-dlp may print warnings to stdout)
    }
  }

  return {
    success: true,
    source: trimmedUrl,
    ...(playlistMeta || {}),
    total_videos: videos.length,
    videos,
  };
}
