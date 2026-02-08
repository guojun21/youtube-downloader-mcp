import * as youtubeDownloadTool from "./youtube_download_task_create.js";
import * as youtubeSubtitleTool from "./youtube_subtitle.js";
import * as youtubeTaskHistoryTool from "./youtube_download_task_list.js";

const REGISTERED_MCP_TOOL_MODULES = [
  youtubeDownloadTool,
  youtubeSubtitleTool,
  youtubeTaskHistoryTool,
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
