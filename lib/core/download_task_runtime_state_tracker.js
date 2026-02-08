/**
 * Why: active download processes need in-memory tracking for PID and progress;
 * this state is ephemeral and doesn't need persistence (lost on restart is OK).
 */

const ACTIVE_TASK_RUNTIME_STATES = new Map();

export function registerActiveTaskRuntimeState(taskId, runtimeState) {
  ACTIVE_TASK_RUNTIME_STATES.set(taskId, runtimeState);
  return runtimeState;
}

export function getActiveTaskRuntimeState(taskId) {
  return ACTIVE_TASK_RUNTIME_STATES.get(taskId) || null;
}

export function updateActiveTaskRuntimeState(taskId, patchFields) {
  const currentState = ACTIVE_TASK_RUNTIME_STATES.get(taskId);
  if (!currentState) return null;
  const updatedState = { ...currentState, ...patchFields };
  ACTIVE_TASK_RUNTIME_STATES.set(taskId, updatedState);
  return updatedState;
}

export function removeActiveTaskRuntimeState(taskId) {
  ACTIVE_TASK_RUNTIME_STATES.delete(taskId);
}
