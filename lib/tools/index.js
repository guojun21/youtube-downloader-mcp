import * as youtubeDownloadTool from "./youtube_download_task_create.js";
import * as youtubeSubtitleTool from "./youtube_subtitle.js";
import * as youtubeTaskHistoryTool from "./youtube_download_task_list.js";
import * as youtubeTranscribeTool from "./youtube_transcribe.js";
import * as youtubeListTool from "./youtube_channel_videos.js";
import * as youtubeInfoTool from "./youtube_info.js";

const REGISTERED_MCP_TOOL_MODULES = [
  youtubeDownloadTool,
  youtubeSubtitleTool,
  youtubeTaskHistoryTool,
  youtubeTranscribeTool,
  youtubeListTool,
  youtubeInfoTool,
];

export function getAllRegisteredToolDefinitions() {
  return REGISTERED_MCP_TOOL_MODULES.map((module) => module.definition);
}

export async function dispatchToolCallByName(toolName, toolArguments) {
  for (const toolModule of REGISTERED_MCP_TOOL_MODULES) {
    if (toolModule.definition.name === toolName) {
      return await toolModule.handler(toolArguments);
    }
  }
  return null;
}
