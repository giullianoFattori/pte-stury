import {
  CONTENT_SOURCES, CONTENT_STATUSES,
} from './types.ts';
import type { AudioAsset, QuestionBankItem } from './types';
import type { Difficulty, PteTaskType, Skill } from '../pte/types';
import {
  AUDIO_MIME_PATTERN, AUDIO_PATH_PATTERN, CONTENT_FIELDS, CONTENT_LIMITS,
  CONTENT_SKILLS, LEGACY_QUESTION_IDS, PUBLISHED_REQUIRED_FIELDS, SHA256_PATTERN,
  newQuestionIdPattern,
} from './validationPolicy.ts';
import { ContentValidationError } from './validationTypes.ts';
import type {
  ContentBatchValidationResult, ContentIssueCode, ContentValidationIssue, ValidationResult,
} from './validationTypes';

const has = (record: Record<string, unknown>, key: string) => Object.hasOwn(record, key);
const taskTypes: readonly PteTaskType[] = ['write-from-dictation', 'repeat-sentence', 'read-aloud'];
function member<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === 'string' && choices.some(choice => choice === value);
}
function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype) return false;
  if (Object.getOwnPropertySymbols(value).length) return false;
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(d =>
    Object.hasOwn(d, 'value') && d.enumerable);
}
function jsonArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Object.keys(descriptors).length === value.length + 1 && Object.entries(descriptors).every(([key, d]) => key === 'length' || (/^(0|[1-9][0-9]*)$/.test(key) && Number(key) < value.length && Object.hasOwn(d, 'value') && d.enumerable));
}
function issue(issues: ContentValidationIssue[], path: string, code: ContentIssueCode, message: string) {
  issues.push(Object.freeze({ path, code, message }));
}
function unknownFields(record: Record<string, unknown>, allowed: readonly string[], prefix: string, issues: ContentValidationIssue[]) {
  for (const key of Object.keys(record)) if (!allowed.includes(key)) {
    // Author feedback remains bounded even for an adversarial unknown key.
    issue(issues, prefix + key.slice(0, 100), 'UNKNOWN_FIELD', 'Field is not part of content schema v1.');
  }
}
function text(record: Record<string, unknown>, key: string, maximum: number, issues: ContentValidationIssue[], prefix = ''): string | undefined {
  if (!has(record, key)) return undefined;
  const value = record[key];
  if (typeof value !== 'string' || !/\S/u.test(value) || Array.from(value).length > maximum) {
    issue(issues, prefix + key, 'INVALID_TEXT', `Expected nonempty text of at most ${maximum} Unicode characters.`);
    return undefined;
  }
  return value;
}
function strings(record: Record<string, unknown>, key: string, maximum: number, entryMaximum: number,
  minimum: number, unique: boolean, issues: ContentValidationIssue[]): readonly string[] | undefined {
  if (!has(record, key)) return undefined;
  const values = record[key];
  if (!Array.isArray(values) || values.length < minimum || values.length > maximum || !jsonArray(values)) {
    issue(issues, key, 'INVALID_ARRAY', `Expected an array containing ${minimum} to ${maximum} entries.`);
    return undefined;
  }
  const result: string[] = [], seen = new Set<string>();
  // Indexed loop also rejects sparse/non-JSON arrays rather than silently skipping holes.
  for (let index = 0; index < values.length; index++) {
    const value: unknown = values[index], path = `${key}[${index}]`;
    if (typeof value !== 'string' || !/\S/u.test(value) || Array.from(value).length > entryMaximum) {
      issue(issues, path, 'INVALID_TEXT', `Expected nonempty text of at most ${entryMaximum} Unicode characters.`);
    } else {
      if (unique && seen.has(value)) issue(issues, path, 'DUPLICATE_VALUE', 'Exact duplicate array entry.');
      seen.add(value); result.push(value);
    }
  }
  return Object.freeze(result);
}
function duration(record: Record<string, unknown>, key: string, integer: boolean, issues: ContentValidationIssue[], prefix = ''): number | undefined {
  if (!has(record, key)) return undefined;
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || (integer && !Number.isSafeInteger(value))) {
    issue(issues, prefix + key, 'INVALID_DURATION', integer ? 'Expected positive safe-integer milliseconds.' : 'Expected positive finite seconds (decimals allowed).');
    return undefined;
  }
  return value;
}
function audio(record: Record<string, unknown>, issues: ContentValidationIssue[]): AudioAsset | undefined {
  if (!has(record, 'audio')) return undefined;
  const value = record.audio;
  if (!plainRecord(value)) { issue(issues, 'audio', 'INVALID_AUDIO_OBJECT', 'Expected a plain JSON audio object.'); return undefined; }
  unknownFields(value, ['path', 'sha256', 'durationMs', 'mimeType'], 'audio.', issues);
  if (!has(value, 'path')) issue(issues, 'audio.path', 'REQUIRED_FIELD', 'Audio path is required.');
  const path = value.path;
  const validPath = typeof path === 'string' && path.length <= CONTENT_LIMITS.audioPath && new RegExp(AUDIO_PATH_PATTERN).test(path);
  if (has(value, 'path') && !validPath) issue(issues, 'audio.path', 'INVALID_AUDIO_PATH', 'Expected a safe root-relative /audio/ path with ASCII segments, no traversal, encoding, query or fragment.');
  const sha256 = value.sha256;
  if (has(value, 'sha256') && (typeof sha256 !== 'string' || !new RegExp(SHA256_PATTERN).test(sha256))) issue(issues, 'audio.sha256', 'INVALID_AUDIO_SHA256', 'Expected exactly 64 lowercase hexadecimal characters.');
  const durationMs = duration(value, 'durationMs', true, issues, 'audio.');
  const mimeType = value.mimeType;
  if (has(value, 'mimeType') && (typeof mimeType !== 'string' || mimeType.length > CONTENT_LIMITS.mimeType || !new RegExp(AUDIO_MIME_PATTERN).test(mimeType))) issue(issues, 'audio.mimeType', 'INVALID_AUDIO_MIME', 'Expected a bounded audio/type MIME without parameters.');
  if (!validPath) return undefined;
  return Object.freeze({ path,
    ...(typeof sha256 === 'string' ? { sha256 } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(typeof mimeType === 'string' ? { mimeType } : {}),
  });
}
function difficulty(value: unknown): value is Difficulty {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

export function parseQuestionBankItem(input: unknown): QuestionBankItem {
  if (!plainRecord(input)) throw new ContentValidationError([{ path: '$', code: 'INVALID_ITEM', message: 'Expected a plain JSON content object with enumerable data fields.' }]);
  const issues: ContentValidationIssue[] = [];
  unknownFields(input, CONTENT_FIELDS, '', issues);
  const id = text(input, 'id', CONTENT_LIMITS.id, issues);
  if (!has(input, 'id')) issue(issues, 'id', 'REQUIRED_FIELD', 'Item ID is required.');
  const taskType = input.taskType;
  const knownTask = member(taskType, taskTypes);
  if (!knownTask) issue(issues, 'taskType', 'INVALID_TASK_TYPE', 'Expected an implemented PTE task type.');
  if (id !== undefined) {
    const identityTask = taskTypes.find(task => new RegExp(newQuestionIdPattern(task)).test(id) || LEGACY_QUESTION_IDS[task].includes(id));
    if (!identityTask) issue(issues, 'id', 'INVALID_ID', 'Expected a nonzero six-digit task ID or an explicitly grandfathered identity.');
    else if (knownTask && identityTask !== taskType) issue(issues, 'id', 'ID_TASK_MISMATCH', 'ID prefix must match taskType.');
  }
  const itemDifficulty = input.difficulty;
  if (!difficulty(itemDifficulty)) issue(issues, 'difficulty', 'INVALID_DIFFICULTY', 'Expected an integer from 1 to 5.');
  const revision = input.revision;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision <= 0) issue(issues, 'revision', 'INVALID_REVISION', 'Expected a positive safe integer.');
  const status = input.status, source = input.source;
  const knownStatus = member(status, CONTENT_STATUSES), knownSource = member(source, CONTENT_SOURCES);
  if (!knownStatus) issue(issues, 'status', 'INVALID_STATUS', 'Expected draft, active or retired.');
  if (!knownSource) issue(issues, 'source', 'INVALID_SOURCE', 'Expected internal, licensed, generated or imported.');
  const prompt = text(input, 'prompt', CONTENT_LIMITS.text, issues);
  if (!has(input, 'prompt')) issue(issues, 'prompt', 'REQUIRED_FIELD', 'Prompt is required even for a draft.');
  const answer = text(input, 'answer', CONTENT_LIMITS.text, issues), transcript = text(input, 'transcript', CONTENT_LIMITS.text, issues);
  if (answer !== undefined && transcript !== undefined && answer !== transcript) issue(issues, 'answer', 'ANSWER_TRANSCRIPT_MISMATCH', 'Answer and transcript must match exactly when both are authored.');
  const topic = text(input, 'topic', CONTENT_LIMITS.topic, issues);
  const tags = strings(input, 'tags', CONTENT_LIMITS.tags, CONTENT_LIMITS.tag, 0, true, issues);
  const skillValues = strings(input, 'skills', CONTENT_SKILLS.length, 20, knownStatus && status !== 'draft' ? 1 : 0, true, issues);
  const skills: Skill[] = [];
  if (skillValues && jsonArray(input.skills)) input.skills.forEach((value, index) => {
    if (typeof value !== 'string') return;
    if (!member(value, CONTENT_SKILLS)) issue(issues, `skills[${index}]`, 'INVALID_SKILL', 'Expected an existing Skill value.');
    else skills.push(value);
  });
  const chunks = strings(input, 'chunks', CONTENT_LIMITS.entries, CONTENT_LIMITS.entry, 1, false, issues);
  const phraseGroups = strings(input, 'phraseGroups', CONTENT_LIMITS.entries, CONTENT_LIMITS.entry, 1, false, issues);
  const stressWords = strings(input, 'stressWords', CONTENT_LIMITS.entries, CONTENT_LIMITS.entry, 1, true, issues);
  const estimatedSeconds = duration(input, 'estimatedSeconds', false, issues);
  const itemAudio = audio(input, issues);
  if (knownTask && knownStatus && status !== 'draft') {
    for (const field of PUBLISHED_REQUIRED_FIELDS[taskType]) if (!has(input, field)) issue(issues, field, 'REQUIRED_FIELD', `${field} is required for active/retired ${taskType} content.`);
  }
  // Construct the typed result from narrowed primitives; no unknown-to-item cast.
  if (issues.length || id === undefined || !knownTask || !difficulty(itemDifficulty) || typeof revision !== 'number'
    || !knownStatus || !knownSource || prompt === undefined) throw new ContentValidationError(issues, id);
  return Object.freeze({ id, taskType, difficulty: itemDifficulty, prompt, revision, status, source,
    ...(answer !== undefined ? { answer } : {}), ...(transcript !== undefined ? { transcript } : {}),
    ...(itemAudio !== undefined ? { audio: itemAudio } : {}), ...(topic !== undefined ? { topic } : {}),
    ...(tags !== undefined ? { tags } : {}), ...(skillValues !== undefined ? { skills: Object.freeze(skills) } : {}),
    ...(chunks !== undefined ? { chunks } : {}), ...(phraseGroups !== undefined ? { phraseGroups } : {}),
    ...(stressWords !== undefined ? { stressWords } : {}), ...(estimatedSeconds !== undefined ? { estimatedSeconds } : {}),
  });
}
export function safeParseQuestionBankItem(input: unknown): ValidationResult<QuestionBankItem> {
  try { return Object.freeze({ success: true, data: parseQuestionBankItem(input) }); }
  catch (error) { if (error instanceof ContentValidationError) return Object.freeze({ success: false, errors: error.issues }); throw error; }
}
// JSON.parse otherwise silently keeps the last repeated object key. Syntax is
// already checked; this bounded iterative token scan detects lost author intent.
function checkJsonKeys(json: string) {
  const stack: { object: boolean; expectsKey: boolean; keys: Set<string>; path: string; key: string }[] = [];
  const tokens = /"(?:\\[\s\S]|[^"\\])*"|[{}[\],:]|[^\s"{}[\],:]+/gu;
  for (const match of json.matchAll(tokens)) {
    const token = match[0], parent = stack.at(-1);
    if (token === '{' || token === '[') {
      if (stack.length >= CONTENT_LIMITS.jsonDepth) throw new ContentValidationError([{ path: '$', code: 'JSON_TOO_DEEP', message: 'Content JSON exceeds 64 container levels.' }]);
      stack.push({ object: token === '{', expectsKey: token === '{', keys: new Set(),
        path: parent ? [parent.path, parent.object ? parent.key : ''].filter(Boolean).join('.').slice(0, 200) : '', key: '' });
    } else if (token === '}' || token === ']') stack.pop();
    else if (token === ',' && parent?.object) parent.expectsKey = true;
    else if (token.startsWith('"') && parent?.object && parent.expectsKey) {
      const key: unknown = JSON.parse(token);
      if (typeof key !== 'string') continue;
      if (parent.keys.has(key)) throw new ContentValidationError([{ path: [parent.path, key.slice(0, 100)].filter(Boolean).join('.'), code: 'DUPLICATE_JSON_KEY', message: 'Object key appears more than once; no last-value override is permitted.' }]);
      parent.keys.add(key); parent.key = key; parent.expectsKey = false;
    }
  }
}
export function parseQuestionBankItemJson(input: unknown): QuestionBankItem {
  if (typeof input !== 'string') throw new ContentValidationError([{ path: '$', code: 'INVALID_JSON', message: 'Expected JSON text.' }]);
  if (input.length > CONTENT_LIMITS.jsonCodeUnits) throw new ContentValidationError([{ path: '$', code: 'JSON_TOO_LARGE', message: 'Item JSON exceeds the 2 Mi-code-unit authoring budget.' }]);
  let value: unknown;
  try { value = JSON.parse(input); }
  catch { throw new ContentValidationError([{ path: '$', code: 'INVALID_JSON', message: 'JSON syntax is invalid.' }]); }
  checkJsonKeys(input);
  return parseQuestionBankItem(value);
}

export function validateQuestionBankItems(input: unknown): ContentBatchValidationResult {
  const errors: ContentValidationIssue[] = [], warnings: ContentValidationIssue[] = [], items: QuestionBankItem[] = [];
  if (!Array.isArray(input) || input.length > CONTENT_LIMITS.batchItems || !jsonArray(input)) {
    return Object.freeze({ success: false, errors: Object.freeze([{ path: '$', code: 'INVALID_BATCH', message: 'Expected an array of at most 10000 content items.' } satisfies ContentValidationIssue]), warnings: Object.freeze([]) });
  }
  const ids = new Map<string, number>(), repeated = new Map<string, number>();
  function warn(index: number, item: QuestionBankItem, field: string, key: string, code: ContentIssueCode) {
    const first = repeated.get(key);
    if (first !== undefined) warnings.push(Object.freeze({ path: `items[${index}].${field}`, code, itemId: item.id, message: `Exact shared value also occurs at items[${first}].${field}; review whether intentional.` }));
    else repeated.set(key, index);
  }
  for (let index = 0; index < input.length; index++) {
    const value: unknown = input[index];
    const rawId = plainRecord(value) && typeof value.id === 'string' && value.id.length <= CONTENT_LIMITS.id ? value.id : undefined;
    if (rawId !== undefined) {
      if (ids.has(rawId)) errors.push(Object.freeze({ path: `items[${index}].id`, code: 'DUPLICATE_ID', itemId: rawId, message: `Stable ID already occurs at items[${ids.get(rawId)}].id; only one source row per ID is allowed.` }));
      else ids.set(rawId, index);
    }
    const result = safeParseQuestionBankItem(value);
    if (!result.success) {
      for (const error of result.errors) errors.push(Object.freeze({ ...error, path: `items[${index}]${error.path === '$' ? '' : '.' + error.path}`, ...(rawId !== undefined ? { itemId: rawId } : {}) }));
      continue;
    }
    const item = result.data; items.push(item);
    // Tuple encoding avoids delimiter collisions without normalizing authored text.
    warn(index, item, 'prompt', JSON.stringify(['prompt', item.taskType, item.prompt]), 'DUPLICATE_PROMPT');
    if (item.answer !== undefined) warn(index, item, 'answer', JSON.stringify(['answer', item.taskType, item.answer]), 'DUPLICATE_ANSWER');
    if (item.transcript !== undefined) warn(index, item, 'transcript', JSON.stringify(['transcript', item.taskType, item.transcript]), 'DUPLICATE_TRANSCRIPT');
    if (item.status === 'active' && item.audio) warn(index, item, 'audio.path', JSON.stringify(['audio', item.audio.path]), 'DUPLICATE_AUDIO_PATH');
  }
  const report = { errors: Object.freeze(errors), warnings: Object.freeze(warnings) };
  // Failed batches expose diagnostics only, never a partially usable items array.
  return errors.length ? Object.freeze({ success: false, ...report }) : Object.freeze({ success: true, items: Object.freeze(items), ...report });
}
