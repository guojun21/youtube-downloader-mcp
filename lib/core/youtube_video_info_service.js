/**
 * Why: extracting full video metadata (chapters, comments, tags, sponsorblock segments)
 * requires yt-dlp's --dump-json --skip-download, which returns a large JSON blob.
 * This service runs yt-dlp, parses the result, and returns a structured subset.
 */

import { spawnSync } from "child_process";
import {
  ensureYtDlpIsInstalledOrAutoInstall,
  buildVideoInfoCommandArguments,
  getYtDlpBinaryPath,
} from "./yt_dlp_command_argument_builder.js";

/**
 * Why: yt-dlp returns upload_date as "YYYYMMDD"; formatting to "YYYY-MM-DD" is more readable.
 */
function formatUploadDate(rawDate) {
  if (!rawDate || typeof rawDate !== "string" || rawDate.length !== 8) return rawDate || null;
  return `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
}

/**
 * Why: chapters from yt-dlp have start_time/end_time in seconds and a title.
 * We format them into a clean array with human-readable time strings.
 */
function formatChapters(rawChapters) {
  if (!Array.isArray(rawChapters) || rawChapters.length === 0) return [];
  return rawChapters.map((ch) => ({
    title: ch.title || null,
    start_time: ch.start_time ?? null,
    end_time: ch.end_time ?? null,
  }));
}

/**
 * Why: comments from --write-comments are nested in the JSON; we flatten them
 * into a simple array with author, text, likes, and reply count.
 */
function formatComments(rawComments) {
  if (!Array.isArray(rawComments)) return [];
  return rawComments.map((c) => ({
    author: c.author || null,
    text: c.text || null,
    likes: c.like_count ?? 0,
    is_pinned: c.is_pinned || false,
    reply_count: c.reply_count ?? 0,
    timestamp: c.timestamp ?? null,
  }));
}

/**
 * Why: sponsorblock segments are embedded as chapters when --sponsorblock-mark is used.
 * We extract them separately from normal chapters by checking the category field.
 */
function extractSponsorBlockSegments(rawChapters) {
  if (!Array.isArray(rawChapters)) return [];
  return rawChapters
    .filter((ch) => ch.categories && ch.categories.length > 0)
    .map((ch) => ({
      title: ch.title || null,
      start_time: ch.start_time ?? null,
      end_time: ch.end_time ?? null,
      categories: ch.categories || [],
    }));
}

/**
 * Why: formats list is useful for checking available qualities/codecs before downloading.
 * We keep only the essential fields to avoid bloating the response.
 */
function formatFormats(rawFormats) {
  if (!Array.isArray(rawFormats)) return [];
  return rawFormats.map((f) => ({
    format_id: f.format_id || null,
    format_note: f.format_note || null,
    ext: f.ext || null,
    resolution: f.resolution || null,
    fps: f.fps ?? null,
    vcodec: f.vcodec || null,
    acodec: f.acodec || null,
    filesize: f.filesize ?? f.filesize_approx ?? null,
  }));
}

/**
 * Why: thumbnails come in many sizes; we pick the largest one for a clean single URL,
 * but also return the full list for callers that want specific sizes.
 */
function formatThumbnails(rawThumbnails) {
  if (!Array.isArray(rawThumbnails) || rawThumbnails.length === 0) return [];
  return rawThumbnails
    .filter((t) => t.url)
    .map((t) => ({
      url: t.url,
      width: t.width ?? null,
      height: t.height ?? null,
      id: t.id || null,
    }));
}

/**
 * Extracts full metadata for a single YouTube video without downloading it.
 *
 * @param {Object} options
 * @param {string} options.url - YouTube video URL
 * @param {boolean} options.includeComments - Whether to fetch comments (slow for popular videos)
 * @param {boolean} options.includeSponsorBlock - Whether to fetch SponsorBlock segments
 * @param {boolean} options.includeFormats - Whether to include available formats list
 * @returns {Object} Structured video metadata
 */
export function getVideoInfo({
  url,
  includeComments = false,
  includeSponsorBlock = false,
  includeFormats = false,
}) {
  ensureYtDlpIsInstalledOrAutoInstall();

  const args = buildVideoInfoCommandArguments({
    url,
    includeComments,
    includeSponsorBlock,
  });

  // Why: comment extraction can be very slow for popular videos (100k+ comments).
  // 5 minutes timeout for comments, 2 minutes otherwise.
  const timeout = includeComments ? 300000 : 120000;

  const result = spawnSync(getYtDlpBinaryPath(), args, {
    encoding: "utf8",
    timeout,
    maxBuffer: 200 * 1024 * 1024,
  });

  if (result.status !== 0) {
    const errorMessage = (result.stderr || result.stdout || "Unknown yt-dlp error").trim();
    throw new Error(`yt-dlp failed: ${errorMessage}`);
  }

  let rawInfo;
  try {
    rawInfo = JSON.parse(result.stdout);
  } catch {
    throw new Error("Failed to parse yt-dlp JSON output.");
  }

  // Why: build the response with always-present fields first, then conditional sections
  const info = {
    id: rawInfo.id || null,
    title: rawInfo.title || null,
    description: rawInfo.description || null,
    upload_date: formatUploadDate(rawInfo.upload_date),
    duration: rawInfo.duration ?? null,
    duration_string: rawInfo.duration_string || null,

    view_count: rawInfo.view_count ?? null,
    like_count: rawInfo.like_count ?? null,
    comment_count: rawInfo.comment_count ?? null,

    channel: rawInfo.channel || rawInfo.uploader || null,
    channel_id: rawInfo.channel_id || null,
    channel_url: rawInfo.channel_url || rawInfo.uploader_url || null,
    channel_follower_count: rawInfo.channel_follower_count ?? null,

    tags: rawInfo.tags || [],
    categories: rawInfo.categories || [],
    chapters: formatChapters(rawInfo.chapters),
    thumbnails: formatThumbnails(rawInfo.thumbnails),

    live_status: rawInfo.live_status || null,
    availability: rawInfo.availability || null,
    webpage_url: rawInfo.webpage_url || null,
  };

  // Why: heatmap data shows view distribution across the video timeline
  if (Array.isArray(rawInfo.heatmap) && rawInfo.heatmap.length > 0) {
    info.heatmap = rawInfo.heatmap;
  }

  if (includeComments && rawInfo.comments) {
    info.comments = formatComments(rawInfo.comments);
  }

  if (includeSponsorBlock) {
    info.sponsorblock_segments = extractSponsorBlockSegments(rawInfo.chapters);
  }

  if (includeFormats && rawInfo.formats) {
    info.formats = formatFormats(rawInfo.formats);
  }

  return { success: true, ...info };
}
