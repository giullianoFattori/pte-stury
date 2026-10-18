import { QUICK_TASK_POOL } from '../pte/taskRegistry.ts';
import { TASK_ORDER } from '../content/canonical.ts';
import { parseStudySessionConfig } from './lifecycle.ts';
import { StudySessionError } from './errors.ts';
import type { ValidatedSessionBuildRequest } from './buildTypes';
export function invalidBuildConfig(path: string, message: string): never {
  throw new StudySessionError({ path, code: 'INVALID_SESSION_CONFIG', message });
}
export function validateBuildRequest(input: unknown): ValidatedSessionBuildRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) invalidBuildConfig('request', 'Expected a plain build request.');
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== 'string' || !['mode', 'itemCount', 'taskTypes', 'difficulties'].includes(key)
      || !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalidBuildConfig('request', 'Unknown fields and accessor properties are unsupported.');
  }
  const value = input as Record<string, unknown>;
  const mode = value.mode;
  if (mode !== 'quick' && mode !== 'task' && mode !== 'mixed') invalidBuildConfig('mode', 'Unsupported practice mode.');
  if (mode === 'quick') {
    if (Object.hasOwn(value, 'taskTypes') || Object.hasOwn(value, 'difficulties')
      || Object.hasOwn(value, 'itemCount') && value.itemCount !== 5)
      invalidBuildConfig('request', 'Quick Practice uses five questions, the explicit Quick pool and unrestricted difficulty.');
    return Object.freeze({ mode, itemCount: 5, taskTypes: QUICK_TASK_POOL });
  }
  const config = parseStudySessionConfig({ itemCount: value.itemCount,
    ...(Object.hasOwn(value, 'taskTypes') ? { taskTypes: value.taskTypes } : {}),
    ...(Object.hasOwn(value, 'difficulties') ? { difficulties: value.difficulties } : {}),
  });
  if (!config.taskTypes || (mode === 'task' ? config.taskTypes.length !== 1 : config.taskTypes.length < 2))
    invalidBuildConfig('taskTypes', 'Task Practice needs one task; Mixed Practice needs at least two.');
  return Object.freeze({ mode, itemCount: config.itemCount,
    taskTypes: Object.freeze(TASK_ORDER.filter(task => config.taskTypes?.includes(task))),
    ...(config.difficulties ? { difficulties: config.difficulties } : {}),
  });
}
