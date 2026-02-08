/**
 * Why: YouTube video IDs are embedded in many URL formats (youtu.be, shorts, embed, etc.);
 * extracting them reliably requires handling all known URL patterns.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WORKSPACE_ROOT_DIRECTORY_PATH = process.env.WORKSPACE_ROOT
  ? path.resolve(process.env.WORKSPACE_ROOT)
  : path.resolve(__dirname, "..", "..");

const YOUTUBE_VIDEO_ID_VALIDATION_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

export function coerceValueToTrimmedString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function extractYoutubeVideoIdFromUrlOrRawInput(input) {
  const rawInput = coerceValueToTrimmedString(input);
  if (!rawInput) return null;
  if (YOUTUBE_VIDEO_ID_VALIDATION_PATTERN.test(rawInput)) return rawInput;

  let parsedUrl;
  try {
    parsedUrl = new URL(rawInput);
  } catch {
    return null;
  }

  const hostnameWithoutWww = parsedUrl.hostname.replace(/^www\./, "");
  const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);

  // Why: youtu.be uses the first path segment as the video ID
  if (hostnameWithoutWww === "youtu.be" && pathSegments[0]) {
    return pathSegments[0];
  }

  const YOUTUBE_HOSTNAME_SUFFIXES = [
    "youtube.com",
    "youtube-nocookie.com",
    "music.youtube.com",
    "m.youtube.com",
  ];

  if (YOUTUBE_HOSTNAME_SUFFIXES.some((suffix) => hostnameWithoutWww.endsWith(suffix))) {
    const videoIdFromQueryParam = parsedUrl.searchParams.get("v");
    if (videoIdFromQueryParam) return videoIdFromQueryParam;
    // Why: shorts, embed, and live URLs put the ID in the second path segment
    if (pathSegments[0] === "shorts" && pathSegments[1]) return pathSegments[1];
    if (pathSegments[0] === "embed" && pathSegments[1]) return pathSegments[1];
    if (pathSegments[0] === "live" && pathSegments[1]) return pathSegments[1];
  }

  return null;
}

export function resolveOutputDirectoryFromUserInput(outputPathInput) {
  const rawPath = coerceValueToTrimmedString(outputPathInput);
  if (!rawPath) return null;
  // Why: shell-style ~ expansion is expected by CLI users
  if (rawPath.startsWith("~")) {
    const pathAfterTilde = rawPath.slice(1).replace(/^[/\\]+/, "");
    return pathAfterTilde ? path.join(os.homedir(), pathAfterTilde) : os.homedir();
  }
  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }
  return path.resolve(WORKSPACE_ROOT_DIRECTORY_PATH, rawPath);
}

export function getWorkspaceRootDirectoryPath() {
  return WORKSPACE_ROOT_DIRECTORY_PATH;
}

/**
 * Why: returns the root youtubevideos/ directory. Individual videos go into
 * timestamped subfolders created by createTimestampedVideoSubdirectory().
 */
export function getDefaultVideoOutputDirectoryPath() {
  return path.resolve(WORKSPACE_ROOT_DIRECTORY_PATH, "youtubevideos");
}

/**
 * Why: generate a minute-precision timestamp prefix for folder names so that
 * downloads are sorted chronologically in the filesystem.
 * Format: YYYYMMDD-HHmm (e.g. "20260209-0200")
 */
function formatMinutePrecisionTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

/**
 * Why: sanitize a video title for use as a directory name by removing
 * filesystem-unsafe characters while preserving CJK and meaningful content.
 */
function sanitizeTitleForDirectoryName(title) {
  // Why: remove characters that are illegal or problematic in directory names
  let sanitized = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "");
  // Why: collapse multiple spaces/underscores
  sanitized = sanitized.replace(/\s+/g, " ").trim();
  // Why: limit length to avoid filesystem path limits (keep 80 chars max)
  if (sanitized.length > 80) {
    sanitized = sanitized.substring(0, 80).trim();
  }
  return sanitized || "untitled";
}

/**
 * Why: each video download gets its own subfolder under youtubevideos/.
 * Naming: YYYYMMDD-HHmm_VideoTitle_[videoId]/
 * This keeps the filesystem organized when many videos are downloaded.
 *
 * If a subfolder for this videoId already exists (from a previous download),
 * returns that existing folder instead of creating a duplicate.
 */
export function createTimestampedVideoSubdirectory(videoId, videoTitle = "") {
  const rootOutputDir = getDefaultVideoOutputDirectoryPath();
  fs.mkdirSync(rootOutputDir, { recursive: true });

  // Why: check if a folder for this videoId already exists (avoid duplicates)
  const existingSubfolder = findExistingVideoSubdirectoryByVideoId(videoId);
  if (existingSubfolder) return existingSubfolder;

  const timestamp = formatMinutePrecisionTimestamp();
  const titlePart = sanitizeTitleForDirectoryName(videoTitle);
  const folderName = `${timestamp}_${titlePart}_[${videoId}]`;
  const fullPath = path.join(rootOutputDir, folderName);
  fs.mkdirSync(fullPath, { recursive: true });

  return fullPath;
}

/**
 * Why: when downloading subtitles or transcribing, we need to find the subfolder
 * that already holds a video's files. Scan youtubevideos/ for any subfolder
 * whose name contains [videoId].
 */
export function findExistingVideoSubdirectoryByVideoId(videoId) {
  const rootOutputDir = getDefaultVideoOutputDirectoryPath();
  if (!fs.existsSync(rootOutputDir)) return null;

  const entries = fs.readdirSync(rootOutputDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.includes(`[${videoId}]`)) {
      return path.join(rootOutputDir, entry.name);
    }
  }
  return null;
}

/**
 * Why: transcription and subtitle tools need to find a downloaded video file
 * anywhere under youtubevideos/ — either in the root (legacy) or inside a
 * timestamped subfolder (new convention). This searches both levels.
 */
export function findDownloadedVideoFileRecursively(videoId, rootDir = null) {
  const searchRoot = rootDir || getDefaultVideoOutputDirectoryPath();
  if (!fs.existsSync(searchRoot)) return null;

  const VIDEO_EXTENSIONS_PATTERN = /\.(mp4|webm|mkv|m4a|mp3|wav|flac|ogg)$/i;

  // Why: first check direct children (legacy flat layout)
  const topLevelEntries = fs.readdirSync(searchRoot, { withFileTypes: true });
  for (const entry of topLevelEntries) {
    if (entry.isFile() && entry.name.includes(`[${videoId}]`) && VIDEO_EXTENSIONS_PATTERN.test(entry.name)) {
      return path.join(searchRoot, entry.name);
    }
  }

  // Why: then check inside timestamped subfolders (new layout)
  for (const entry of topLevelEntries) {
    if (entry.isDirectory()) {
      const subDirPath = path.join(searchRoot, entry.name);
      try {
        const subFiles = fs.readdirSync(subDirPath);
        for (const fileName of subFiles) {
          if (fileName.includes(`[${videoId}]`) && VIDEO_EXTENSIONS_PATTERN.test(fileName)) {
            return path.join(subDirPath, fileName);
          }
        }
      } catch {
        // Why: skip unreadable directories
      }
    }
  }

  return null;
}
