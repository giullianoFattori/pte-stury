import type { PteTaskType, Difficulty } from '../pte/types';
import type { ContentVersion } from '../content/types';
import { QUESTION_ID_PREFIXES } from '../content/types.ts';
import { LEGACY_QUESTION_IDS, newQuestionIdPattern } from '../content/validationPolicy.ts';
import {
  MAX_SESSION_ITEMS, STUDY_SESSION_MODES, STUDY_SESSION_STATUSES,
  type StudySession, type StudySessionConfig, type StoredStudySession,
  type CreateStudySessionInput, type SessionAttemptLink,
} from './types.ts';
import { StudySessionError, type StudySessionErrorCode } from './errors.ts';
const tasks = Object.freeze(Object.keys(QUESTION_ID_PREFIXES) as PteTaskType[]);
const baseFields = ['id', 'startedAt', 'finishedAt', 'taskTypes', 'attemptIds'];
const fields = [...baseFields, 'mode', 'status', 'contentVersion', 'itemIds', 'currentIndex', 'config'];
function fail(path: string, message: string, code: StudySessionErrorCode = 'INVALID_SESSION_STATE'): never {
  throw new StudySessionError({ path, code, message });
}
function object(input: unknown, keys: readonly string[], path: string, code?: StudySessionErrorCode): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail(path, 'Expected a plain session object.', code);
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== 'string' || !keys.includes(key) || !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value'))
      fail(path, 'Unknown fields and accessor properties are not supported.', code);
  }
  return input as Record<string, unknown>;
}
function enumValue<T extends string>(input: unknown, values: readonly T[], path: string, code?: StudySessionErrorCode): T {
  const found = values.find(value => value === input);
  if (found === undefined) fail(path, 'Unsupported session value.', code);
  return found;
}
function string(input: unknown, path: string): string {
  if (typeof input !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$(?![\s\S])/.test(input)) fail(path, 'Expected a bounded opaque identity.');
  return input;
}
function text(input: unknown, path: string): string {
  if (typeof input !== 'string' || !input.trim() || input.length > 128) fail(path, 'Expected a nonempty bounded timestamp.');
  return input;
}
function time(input: unknown, path: string): string {
  const value = text(input, path), milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) fail(path, 'Expected a valid UTC ISO timestamp with milliseconds.');
  return value;
}
function list<T>(input: unknown, path: string, read: (value: unknown, path: string) => T, maximum = MAX_SESSION_ITEMS): readonly T[] {
  if (!Array.isArray(input) || input.length > maximum) fail(path, 'Expected a bounded array.');
  const out: T[] = [];
  for (let index = 0; index < input.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail(path, 'Sparse arrays and accessor entries are unsupported.');
    out.push(read(descriptor.value, `${path}[${index}]`));
  }
  return Object.freeze(out);
}
function unique<T>(values: readonly T[], path: string, code?: StudySessionErrorCode) {
  if (new Set(values).size !== values.length) fail(path, 'Duplicate entries are unsupported.', code);
}
function taskList(input: unknown, path: string): readonly PteTaskType[] {
  const values = list(input, path, (value, key) => enumValue(value, tasks, key), tasks.length);
  if (!values.length) fail(path, 'At least one selection task is required.');
  unique(values, path); return values;
}
function itemTask(id: string, path: string): PteTaskType {
  const task = tasks.find(task => LEGACY_QUESTION_IDS[task].some(legacy => legacy === id) || new RegExp(newQuestionIdPattern(task)).test(id));
  if (!task) fail(path, 'Expected a permanent content identity with a registered task prefix.');
  return task;
}
export function parseStudySessionConfig(input: unknown): StudySessionConfig {
  const config = object(input, ['itemCount', 'difficulties', 'taskTypes'], 'config', 'INVALID_SESSION_CONFIG');
  if (!Number.isSafeInteger(config.itemCount) || Number(config.itemCount) < 1 || Number(config.itemCount) > MAX_SESSION_ITEMS)
    fail('config.itemCount', 'Item count must be an integer from 1 to 500.', 'INVALID_SESSION_CONFIG');
  let difficulties: readonly Difficulty[] | undefined, taskTypes: readonly PteTaskType[] | undefined;
  try {
    if (Object.hasOwn(config, 'difficulties')) {
      difficulties = list(config.difficulties, 'config.difficulties', (value, path) => {
        if (![1, 2, 3, 4, 5].some(d => d === value)) fail(path, 'Difficulty must be an integer from 1 to 5.');
        return value as Difficulty;
      }, 5);
      if (!difficulties.length) fail('config.difficulties', 'A supplied difficulty filter must not be empty.');
      unique(difficulties, 'config.difficulties');
    }
    if (Object.hasOwn(config, 'taskTypes')) taskTypes = taskList(config.taskTypes, 'config.taskTypes');
  } catch (error) {
    if (error instanceof StudySessionError) fail(error.issues[0].path, error.message, 'INVALID_SESSION_CONFIG');
    throw error;
  }
  return Object.freeze({ itemCount: Number(config.itemCount), ...(difficulties ? { difficulties } : {}), ...(taskTypes ? { taskTypes } : {}) });
}
function parseVersioned(input: Record<string, unknown>): StudySession {
  const id = string(input.id, 'id'), mode = enumValue(input.mode, STUDY_SESSION_MODES, 'mode');
  const status = enumValue(input.status, STUDY_SESSION_STATUSES, 'status');
  const startedAt = time(input.startedAt, 'startedAt'), taskTypes = taskList(input.taskTypes, 'taskTypes');
  const itemIds = list(input.itemIds, 'itemIds', (value, path) => { const id = string(value, path); itemTask(id, path); return id; });
  if (!itemIds.length) fail('itemIds', 'The frozen queue must be nonempty.');
  unique(itemIds, 'itemIds');
  const attemptIds = list(input.attemptIds, 'attemptIds', string); unique(attemptIds, 'attemptIds');
  const currentIndex = input.currentIndex;
  if (typeof currentIndex !== 'number' || !Number.isSafeInteger(currentIndex) || currentIndex < 0 || currentIndex > itemIds.length)
    fail('currentIndex', 'Current position must be an integer within the queue, including its exhausted boundary.');
  if (attemptIds.length !== currentIndex) fail('attemptIds', 'Exactly one attempt is required for each answered position.');
  const config = parseStudySessionConfig(input.config);
  if (config.itemCount !== itemIds.length) fail('config.itemCount', 'Configured count must equal the frozen queue size.', 'INVALID_SESSION_CONFIG');
  if (config.taskTypes && taskTypes.some(t => !config.taskTypes?.includes(t)))
    fail('config.taskTypes', 'Queue tasks must belong to configured selection tasks.', 'INVALID_SESSION_CONFIG');
  const selectionTasks = config.taskTypes ?? taskTypes;
  if (mode === 'task' && selectionTasks.length !== 1 || mode === 'mixed' && selectionTasks.length < 2)
    fail('taskTypes', 'Task practice needs one task; mixed practice needs at least two.', 'INVALID_SESSION_CONFIG');
  itemIds.forEach((id, i) => { if (!taskTypes.includes(itemTask(id, `itemIds[${i}]`))) fail(`itemIds[${i}]`, 'Queue item task is outside the configured selection.'); });
  let finishedAt: string | undefined, contentVersion: ContentVersion | undefined;
  if (Object.hasOwn(input, 'contentVersion')) {
    if (typeof input.contentVersion !== 'string' || !/^sha256:[0-9a-f]{64}$(?![\s\S])/.test(input.contentVersion)) fail('contentVersion', 'Expected a SHA-256 catalog identity.');
    contentVersion = input.contentVersion as ContentVersion;
  }
  if (status === 'active') { if (Object.hasOwn(input, 'finishedAt')) fail('finishedAt', 'An active session cannot have a finish timestamp.'); }
  else {
    finishedAt = time(input.finishedAt, 'finishedAt');
    if (Date.parse(finishedAt) < Date.parse(startedAt)) fail('finishedAt', 'Finish time cannot precede start time.');
    if (status === 'completed' && currentIndex !== itemIds.length) fail('currentIndex', 'A completed session must answer the entire queue.');
  }
  return Object.freeze({ id, mode, status, startedAt, ...(finishedAt ? { finishedAt } : {}), ...(contentVersion ? { contentVersion } : {}), taskTypes, itemIds, currentIndex, attemptIds, config });
}
/** Explicit historical union: never infer status or manufacture a queue. */
export function parseStoredStudySession(input: unknown): StoredStudySession {
  const value = object(input, fields, 'session');
  if (fields.filter(key => !baseFields.includes(key)).some(key => Object.hasOwn(value, key))) return parseVersioned(value);
  const id = string(value.id, 'id'), startedAt = text(value.startedAt, 'startedAt');
  const taskTypes = list(value.taskTypes, 'taskTypes', (v, p) => enumValue(v, tasks, p), 10000);
  const attemptIds = list(value.attemptIds, 'attemptIds', string, 10000);
  const finishedAt = Object.hasOwn(value, 'finishedAt') ? text(value.finishedAt, 'finishedAt') : undefined;
  return Object.freeze({ id, startedAt, ...(finishedAt ? { finishedAt } : {}), taskTypes, attemptIds });
}
export function parseStudySession(input: unknown): StudySession {
  const value = parseStoredStudySession(input);
  if (value.mode === undefined) fail('session', 'Historical sessions have no resumable queue.', 'LEGACY_SESSION_NOT_RESUMABLE');
  return value;
}
export function createStudySession(input: CreateStudySessionInput): StudySession {
  const value = object(input, fields.filter(key => !['status', 'attemptIds', 'currentIndex', 'finishedAt'].includes(key)), 'session');
  return parseStudySession({ ...value, status: 'active', currentIndex: 0, attemptIds: [] });
}
function active(input: StudySession): StudySession {
  const session = parseStudySession(input);
  if (session.status === 'completed') fail('status', 'The session is already completed.', 'SESSION_ALREADY_COMPLETED');
  if (session.status !== 'active') fail('status', 'The session is not active.', 'SESSION_NOT_ACTIVE');
  return session;
}
/** Persistence must re-read the row and invoke this operation inside its future transaction. */
export function recordSessionAttempt(input: StudySession, attempt: SessionAttemptLink, expectedCurrentIndex: number): StudySession {
  const session = active(input);
  if (!Number.isSafeInteger(expectedCurrentIndex) || expectedCurrentIndex !== session.currentIndex || session.currentIndex === session.itemIds.length)
    fail('currentIndex', 'Session progress changed or the queue is exhausted.', 'SESSION_PROGRESS_CONFLICT');
  const link = object(attempt, ['id', 'itemId', 'taskType', 'sessionId'], 'attempt');
  const id = string(link.id, 'attempt.id');
  if (link.sessionId !== session.id || link.itemId !== session.itemIds[session.currentIndex] || link.taskType !== itemTask(session.itemIds[session.currentIndex], 'itemIds'))
    fail('attempt', 'Saved attempt must belong to this session and current item/task.', 'SESSION_ATTEMPT_MISMATCH');
  if (session.attemptIds.includes(id)) fail('attempt.id', 'Attempt progress cannot be appended twice.', 'SESSION_PROGRESS_CONFLICT');
  return parseStudySession({ ...session, currentIndex: session.currentIndex + 1, attemptIds: [...session.attemptIds, id] });
}
export function completeStudySession(input: StudySession, finishedAt: string): StudySession {
  const session = active(input);
  if (session.currentIndex !== session.itemIds.length) fail('currentIndex', 'Answer all queued items before completing.', 'SESSION_PROGRESS_CONFLICT');
  return parseStudySession({ ...session, status: 'completed', finishedAt });
}
export function abandonStudySession(input: StudySession, finishedAt: string): StudySession {
  return parseStudySession({ ...active(input), status: 'abandoned', finishedAt });
}
