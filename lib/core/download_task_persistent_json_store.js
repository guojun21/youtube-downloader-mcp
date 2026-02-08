/**
 * Why: download tasks must survive process restarts so users can check history;
 * a simple JSON file store avoids database dependencies while being human-readable.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TASK_DATA_DIRECTORY_PATH = path.resolve(__dirname, "..", "..", "data");
const TASK_DATABASE_FILE_PATH = path.join(TASK_DATA_DIRECTORY_PATH, "tasks.json");

const EMPTY_TASK_DATABASE_STRUCTURE = {
  tasks: [],
};

let cachedDatabaseContents = null;

function ensureDirectoryExistsRecursively(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

export function getCurrentIsoTimestamp() {
  return new Date().toISOString();
}

export function getTaskDatabaseFilePath() {
  return TASK_DATABASE_FILE_PATH;
}

export function loadTaskDatabaseFromDisk() {
  if (cachedDatabaseContents) return cachedDatabaseContents;
  ensureDirectoryExistsRecursively(TASK_DATA_DIRECTORY_PATH);
  if (!fs.existsSync(TASK_DATABASE_FILE_PATH)) {
    fs.writeFileSync(TASK_DATABASE_FILE_PATH, JSON.stringify(EMPTY_TASK_DATABASE_STRUCTURE, null, 2), "utf-8");
    cachedDatabaseContents = { tasks: [] };
    return cachedDatabaseContents;
  }
  const rawFileContents = fs.readFileSync(TASK_DATABASE_FILE_PATH, "utf-8");
  try {
    const parsedContents = JSON.parse(rawFileContents);
    if (!parsedContents || typeof parsedContents !== "object") {
      cachedDatabaseContents = { tasks: [] };
    } else if (!Array.isArray(parsedContents.tasks)) {
      cachedDatabaseContents = { ...parsedContents, tasks: [] };
    } else {
      cachedDatabaseContents = parsedContents;
    }
  } catch {
    cachedDatabaseContents = { tasks: [] };
  }
  return cachedDatabaseContents;
}

export function persistTaskDatabaseToDisk(databaseContents) {
  ensureDirectoryExistsRecursively(TASK_DATA_DIRECTORY_PATH);
  cachedDatabaseContents = databaseContents;
  fs.writeFileSync(TASK_DATABASE_FILE_PATH, JSON.stringify(databaseContents, null, 2), "utf-8");
}

export function retrieveAllTaskRecords() {
  const database = loadTaskDatabaseFromDisk();
  return database.tasks.slice();
}

export function findTaskRecordById(taskId) {
  const database = loadTaskDatabaseFromDisk();
  return database.tasks.find((task) => task.id === taskId) || null;
}

export function insertNewTaskRecord(taskRecord) {
  const database = loadTaskDatabaseFromDisk();
  database.tasks.push(taskRecord);
  persistTaskDatabaseToDisk(database);
  return taskRecord;
}

export function updateExistingTaskRecord(taskId, patchFields) {
  const database = loadTaskDatabaseFromDisk();
  const taskIndex = database.tasks.findIndex((task) => task.id === taskId);
  if (taskIndex === -1) return null;
  const updatedRecord = {
    ...database.tasks[taskIndex],
    ...patchFields,
    updated_at: getCurrentIsoTimestamp(),
  };
  database.tasks[taskIndex] = updatedRecord;
  persistTaskDatabaseToDisk(database);
  return updatedRecord;
}
