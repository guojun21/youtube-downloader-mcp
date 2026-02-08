/**
 * Why: YouTube video IDs are embedded in many URL formats (youtu.be, shorts, embed, etc.);
 * extracting them reliably requires handling all known URL patterns.
 */

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

export function getDefaultVideoOutputDirectoryPath() {
  return path.resolve(WORKSPACE_ROOT_DIRECTORY_PATH, "youtubevideos");
}
