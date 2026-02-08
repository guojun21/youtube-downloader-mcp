/**
 * MCP tool definition: youtube_task_history
 * Why: thin wrapper — reads from the persistent task store.
 */

import {
  getTaskDatabaseFilePath,
  retrieveAllTaskRecords,
} from "../core/download_task_persistent_json_store.js";
import { coerceValueToTrimmedString } from "../core/youtube_video_id_extractor_utility.js";
import {
  formatSuccessResultAsJsonContent,
  formatErrorResultAsTextContent,
} from "../core/mcp_result_formatting_helpers.js";

export const definition = {
  name: "youtube_task_history",
  description:
    "View history of all YouTube tasks (downloads and subtitle fetches). Shows date, video ID, type, output path, and status for each task.",
  inputSchema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        description:
          "Filter by task type: 'download' or 'subtitle'. Omit to show all.",
      },
      status: {
        type: "string",
        description: "Optional status filter (case-insensitive).",
      },
      limit: {
        type: "number",
        description: "Max number of tasks to return (default 50, max 200).",
      },
      offset: {
        type: "number",
        description: "Offset for pagination (default 0).",
      },
      order: {
        type: "string",
        description: "Sort by created_at: 'asc' or 'desc' (default desc).",
      },
    },
  },
};

export async function handler(args = {}) {
  const typeFilter = coerceValueToTrimmedString(args.type).toLowerCase();
  const statusFilter = coerceValueToTrimmedString(args.status).toLowerCase();
  const sortOrder = coerceValueToTrimmedString(args.order).toLowerCase() || "desc";
  const requestedLimit = Number.isFinite(args.limit) ? args.limit : 50;
  const requestedOffset = Number.isFinite(args.offset) ? args.offset : 0;

  if (requestedLimit < 1) return formatErrorResultAsTextContent("limit must be >= 1.");
  if (requestedOffset < 0) return formatErrorResultAsTextContent("offset must be >= 0.");

  const clampedLimit = Math.min(Math.floor(requestedLimit), 200);
  const clampedOffset = Math.floor(requestedOffset);

  let taskRecords = retrieveAllTaskRecords();

  if (typeFilter) {
    taskRecords = taskRecords.filter(
      (task) => (task.type || "download").toLowerCase() === typeFilter
    );
  }
  if (statusFilter) {
    taskRecords = taskRecords.filter(
      (task) => (task.status || "").toLowerCase() === statusFilter
    );
  }

  taskRecords.sort((taskA, taskB) => {
    const timestampA = taskA.created_at ? Date.parse(taskA.created_at) : 0;
    const timestampB = taskB.created_at ? Date.parse(taskB.created_at) : 0;
    return (Number.isFinite(timestampA) ? timestampA : 0) - (Number.isFinite(timestampB) ? timestampB : 0);
  });
  if (sortOrder !== "asc") {
    taskRecords.reverse();
  }

  const totalMatchingTasks = taskRecords.length;
  const paginatedTaskRecords = taskRecords.slice(clampedOffset, clampedOffset + clampedLimit);

  const taskSummaries = paginatedTaskRecords.map((task) => {
    const baseSummary = {
      id: task.id,
      type: task.type || "download",
      video_id: task.video_id,
      source_url: task.source_url,
      status: task.status,
      output_path: task.output_path,
      created_at: task.created_at,
      finished_at: task.finished_at || null,
    };

    if ((task.type || "download") === "download") {
      baseSummary.file_name = task.file_name || null;
      baseSummary.file_path = task.file_path || null;
    } else if (task.type === "subtitle") {
      baseSummary.language = task.language || null;
      baseSummary.subtitle_path = task.subtitle_path || null;
      baseSummary.transcript_path = task.transcript_path || null;
    }

    if (task.error) {
      baseSummary.error = task.error;
    }

    return baseSummary;
  });

  return formatSuccessResultAsJsonContent({
    success: true,
    total: totalMatchingTasks,
    offset: clampedOffset,
    limit: clampedLimit,
    tasks: taskSummaries,
    db_path: getTaskDatabaseFilePath(),
  });
}
