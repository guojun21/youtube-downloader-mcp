/**
 * Why: yt-dlp has dozens of CLI flags; centralizing argument construction
 * ensures consistent cookie/player-client/extractor settings across all commands.
 */

import { spawnSync } from "child_process";
import { coerceValueToTrimmedString } from "./youtube_video_id_extractor_utility.js";

const YTDLP_DEFAULT_BROWSER_FOR_COOKIES = process.env.YTDL_BROWSER || "chrome";
const YTDLP_DEFAULT_YOUTUBE_PLAYER_CLIENT = process.env.YTDL_PLAYER_CLIENT || "android";
const YTDLP_BROWSER_COOKIES_ENABLED_BY_DEFAULT = process.env.YTDL_USE_COOKIES !== "false";

let ytDlpAvailabilityAlreadyVerified = false;
let ytDlpIsConfirmedAvailable = false;

function checkIfYtDlpModuleIsInstalled() {
  const versionCheckResult = spawnSync("python3", ["-m", "yt_dlp", "--version"], {
    encoding: "utf8",
  });
  return versionCheckResult.status === 0;
}

export function ensureYtDlpIsInstalledOrAutoInstall() {
  if (ytDlpAvailabilityAlreadyVerified && ytDlpIsConfirmedAvailable) return true;

  if (checkIfYtDlpModuleIsInstalled()) {
    ytDlpAvailabilityAlreadyVerified = true;
    ytDlpIsConfirmedAvailable = true;
    return true;
  }

  // Why: auto-install to user site-packages avoids requiring sudo
  const installResult = spawnSync("python3", ["-m", "pip", "install", "--user", "yt-dlp"], {
    encoding: "utf8",
  });

  ytDlpAvailabilityAlreadyVerified = true;
  ytDlpIsConfirmedAvailable = installResult.status === 0 && checkIfYtDlpModuleIsInstalled();

  if (!ytDlpIsConfirmedAvailable) {
    const stderrOutput = installResult.stderr?.trim() || "";
    const stdoutOutput = installResult.stdout?.trim() || "";
    const diagnosticDetails = [stderrOutput, stdoutOutput].filter(Boolean).join("\n");
    throw new Error(
      `yt-dlp not available. Install failed. ${diagnosticDetails ? "Details:\n" + diagnosticDetails : ""}`
    );
  }

  return true;
}

function buildBrowserCookieArgumentString(browserName, browserProfile) {
  const resolvedBrowser = coerceValueToTrimmedString(browserName) || YTDLP_DEFAULT_BROWSER_FOR_COOKIES;
  const resolvedProfile = coerceValueToTrimmedString(browserProfile);
  if (!resolvedBrowser) return "";
  if (resolvedProfile) return `${resolvedBrowser}:${resolvedProfile}`;
  return resolvedBrowser;
}

function buildCommonBaseCommandArguments(options) {
  const baseArgs = ["-m", "yt_dlp", "--no-color", "--newline"];

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

export function buildSubtitleListCommandArguments(options) {
  const args = buildCommonBaseCommandArguments(options);
  args.push("--list-subs", "--skip-download", options.url);
  return args;
}

export function buildSubtitleDownloadCommandArguments(options) {
  const args = buildCommonBaseCommandArguments(options);
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
