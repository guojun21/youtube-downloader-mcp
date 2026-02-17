/**
 * Why: yt-dlp has dozens of CLI flags; centralizing argument construction
 * ensures consistent cookie/player-client/extractor settings across all commands.
 *
 * Uses the yt-dlp binary directly (e.g. installed via Homebrew) instead of
 * python3 -m yt_dlp, which avoids PEP 668 externally-managed-environment issues.
 */

import { spawnSync } from "child_process";
import { coerceValueToTrimmedString } from "./youtube_video_id_extractor_utility.js";

const YTDLP_DEFAULT_BROWSER_FOR_COOKIES = process.env.YTDL_BROWSER || "chrome";
// Why: "android" player client doesn't support cookies, causing failures on
// age-restricted or region-locked videos. "default" (web client) works with cookies.
const YTDLP_DEFAULT_YOUTUBE_PLAYER_CLIENT = process.env.YTDL_PLAYER_CLIENT || "default";
const YTDLP_BROWSER_COOKIES_ENABLED_BY_DEFAULT = process.env.YTDL_USE_COOKIES !== "false";

/**
 * Why: resolve the yt-dlp binary path once — supports Homebrew, pipx, system PATH.
 * Falls back to "yt-dlp" (will use PATH lookup at spawn time).
 */
const YTDLP_BINARY_PATH = (() => {
  const candidates = [
    process.env.YTDLP_PATH,         // explicit override
    "/opt/homebrew/bin/yt-dlp",      // Homebrew Apple Silicon
    "/usr/local/bin/yt-dlp",         // Homebrew Intel / manual install
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const result = spawnSync(candidate, ["--version"], { encoding: "utf8", timeout: 5000 });
      if (result.status === 0) return candidate;
    } catch { /* ignore */ }
  }

  // Why: fallback to bare name, let OS PATH resolve it
  return "yt-dlp";
})();

let ytDlpAvailabilityAlreadyVerified = false;
let ytDlpIsConfirmedAvailable = false;

export function ensureYtDlpIsInstalledOrAutoInstall() {
  if (ytDlpAvailabilityAlreadyVerified && ytDlpIsConfirmedAvailable) return true;

  const versionCheck = spawnSync(YTDLP_BINARY_PATH, ["--version"], {
    encoding: "utf8",
    timeout: 10000,
  });

  if (versionCheck.status === 0) {
    ytDlpAvailabilityAlreadyVerified = true;
    ytDlpIsConfirmedAvailable = true;
    return true;
  }

  throw new Error(
    `yt-dlp not found. Please install it:\n` +
    `  macOS: brew install yt-dlp\n` +
    `  Linux: pip install --user yt-dlp\n` +
    `  Or set YTDLP_PATH env var to the binary location.`
  );
}

export function getYtDlpBinaryPath() {
  return YTDLP_BINARY_PATH;
}

function buildBrowserCookieArgumentString(browserName, browserProfile) {
  const resolvedBrowser = coerceValueToTrimmedString(browserName) || YTDLP_DEFAULT_BROWSER_FOR_COOKIES;
  const resolvedProfile = coerceValueToTrimmedString(browserProfile);
  if (!resolvedBrowser) return "";
  if (resolvedProfile) return `${resolvedBrowser}:${resolvedProfile}`;
  return resolvedBrowser;
}

/**
 * Why: no longer includes "-m", "yt_dlp" prefix since we call the yt-dlp binary directly.
 */
function buildCommonBaseCommandArguments(options) {
  const baseArgs = ["--no-color", "--newline"];

  const shouldUseBrowserCookies =
    typeof options.useCookies === "boolean" ? options.useCookies : YTDLP_BROWSER_COOKIES_ENABLED_BY_DEFAULT;
  if (shouldUseBrowserCookies) {
    const cookieBrowserArg = buildBrowserCookieArgumentString(options.browser, options.browserProfile);
    if (cookieBrowserArg) {
      baseArgs.push("--cookies-from-browser", cookieBrowserArg);
    }
  }

  const youtubePlayerClient =
    coerceValueToTrimmedString(options.playerClient) || YTDLP_DEFAULT_YOUTUBE_PLAYER_CLIENT;
  const proofOfOriginToken = coerceValueToTrimmedString(options.poToken);
  const youtubeExtractorArgs = [];
  if (youtubePlayerClient) youtubeExtractorArgs.push(`player_client=${youtubePlayerClient}`);
  if (proofOfOriginToken) youtubeExtractorArgs.push(`po_token=${proofOfOriginToken}`);
  if (youtubeExtractorArgs.length) {
    baseArgs.push("--extractor-args", `youtube:${youtubeExtractorArgs.join(";")}`);
  }

  return baseArgs;
}

export function buildVideoDownloadCommandArguments(options) {
  const args = buildCommonBaseCommandArguments(options);
  if (options.format) {
    args.push("-f", options.format);
  }
  if (options.outputTemplate) {
    args.push("-o", options.outputTemplate);
  }
  args.push(options.url);
  return args;
}

/**
 * Why: subtitle listing and downloading must NOT use player_client=android
 * because the Android API does not return subtitle tracks. We override
 * to use the default web client for subtitle-related commands.
 */
export function buildSubtitleListCommandArguments(options) {
  const args = buildCommonBaseCommandArguments({ ...options, playerClient: "default" });
  args.push("--list-subs", "--skip-download", options.url);
  return args;
}

/**
 * Why: --flat-playlist avoids extracting full video info (much faster for large channels);
 * --dump-json outputs one JSON object per line with video metadata.
 * Uses the default web client since channel/playlist pages are web-only.
 */
export function buildChannelVideoListCommandArguments(options) {
  const args = buildCommonBaseCommandArguments({ ...options, playerClient: "default" });
  args.push("--flat-playlist", "--dump-json");
  if (options.playlistEnd) {
    args.push("--playlist-end", String(options.playlistEnd));
  }
  args.push(options.url);
  return args;
}

/**
 * Why: --dump-json --skip-download extracts full video metadata (chapters, tags,
 * thumbnails, etc.) without downloading the video file. Conditionally adds
 * --write-comments and --sponsorblock-mark for richer data when requested.
 */
export function buildVideoInfoCommandArguments(options) {
  const args = buildCommonBaseCommandArguments({ ...options, playerClient: "default" });
  args.push("--dump-json", "--skip-download");
  if (options.includeComments) {
    args.push("--write-comments");
  }
  if (options.includeSponsorBlock) {
    args.push("--sponsorblock-mark", "all");
  }
  args.push(options.url);
  return args;
}

export function buildSubtitleDownloadCommandArguments(options) {
  const args = buildCommonBaseCommandArguments({ ...options, playerClient: "default" });
  args.push(
    "--write-auto-subs",
    "--write-subs",
    "--sub-lang", options.subLang || "en-orig,en",
    "--sub-format", "srt",
    "--skip-download",
  );
  if (options.outputTemplate) {
    args.push("-o", options.outputTemplate);
  }
  args.push(options.url);
  return args;
}
