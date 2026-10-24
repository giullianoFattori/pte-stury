import type { PteTaskType } from '../pte/types';
import type { Wave1TaskData } from '../pte/taskData';
import { TASK_DATA_RULES, type DataRule } from './taskDataPolicy.ts';
import { ContentValidationError, type ContentValidationIssue } from './validationTypes.ts';
export function dataObject(input: unknown): input is Record<string, unknown> {
  return !!input && typeof input === 'object' && !Array.isArray(input) && [Object.prototype, null].includes(Object.getPrototypeOf(input))
    && Reflect.ownKeys(input).every(key => typeof key === 'string' && Object.getOwnPropertyDescriptor(input, key)?.enumerable && Object.hasOwn(Object.getOwnPropertyDescriptor(input, key)!, 'value'));
}
function invalid(path: string, message: string): never { throw new ContentValidationError([{ path, code: 'INVALID_TASK_DATA', message }]); }
function parse(value: unknown, rule: DataRule, path: string): unknown {
  if (rule.type === 'object') {
    if (!dataObject(value)) invalid(path, 'Expected a plain JSON object.');
    for (const key of Object.keys(value)) if (!Object.hasOwn(rule.properties!, key)) invalid(`${path}.${key}`, 'Unknown task field.');
    for (const key of rule.required ?? []) if (!Object.hasOwn(value, key)) invalid(`${path}.${key}`, 'Required task field is missing.');
    return Object.freeze(Object.fromEntries(Object.entries(rule.properties!).filter(([key]) => Object.hasOwn(value, key)).map(([key, child]) => [key, parse(value[key], child, `${path}.${key}`)])));
  }
  if (rule.type === 'array') {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1 || value.length < (rule.minItems ?? 0) || value.length > (rule.maxItems ?? 10000)) invalid(path, 'Expected a bounded JSON array.');
    const parsed: unknown[] = [];
    for (let i = 0; i < value.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalid(path, 'Sparse/accessor arrays are forbidden.');
      parsed.push(parse(descriptor.value, rule.items!, `${path}[${i}]`));
    }
    return Object.freeze(parsed);
  }
  if (rule.type === 'string') {
    if (typeof value !== 'string' || Array.from(value).length < (rule.minLength ?? 0) || Array.from(value).length > (rule.maxLength ?? 100000)
      || rule.pattern && !new RegExp(rule.pattern, 'u').test(value) || rule.enum && !rule.enum.includes(value)) invalid(path, 'Invalid text, enum or local asset syntax.');
  } else if (rule.type === 'boolean') { if (typeof value !== 'boolean') invalid(path, 'Expected a boolean.'); }
  else if (typeof value !== 'number' || !Number.isFinite(value) || rule.type === 'integer' && !Number.isSafeInteger(value)
    || value < (rule.minimum ?? 0) || value > (rule.maximum ?? Number.MAX_VALUE)) invalid(path, 'Expected a finite bounded number.');
  return value;
}
/** Rules shared with JSON Schema; semantic references/truth remain authoritative here. */
export function parseTaskData(task: PteTaskType, value: unknown, published: boolean): Wave1TaskData {
  if (!Object.hasOwn(TASK_DATA_RULES, task)) invalid('taskData', 'Foundation content retains its legacy fields; taskData is not supported.');
  const data = parse(value, TASK_DATA_RULES[task as keyof typeof TASK_DATA_RULES], 'taskData') as Wave1TaskData;
  if ('audio' in data && published && data.audio.sha256 === undefined) invalid('taskData.audio.sha256', 'Published audio requires SHA-256.');
  if(task==='summarize-spoken-text'&&published){
    const asset=(data as import('../pte/taskData').SummarizeSpokenTextItemData).audio;
    if(!asset.durationMs||asset.durationMs<60_000||asset.durationMs>90_000)invalid('taskData.audio.durationMs','Published Summarize Spoken Text audio must declare a duration from 60 to 90 seconds.');
  }
  if(task==='highlight-incorrect-words'&&published){
    const asset=(data as import('../pte/taskData').HighlightIncorrectWordsItemData).audio;
    if(!asset.durationMs||asset.durationMs<15_000||asset.durationMs>50_000)invalid('taskData.audio.durationMs','Published Highlight Incorrect Words audio must declare a duration from 15 to 50 seconds.');
  }
  if (task === 'retell-lecture') {
    const retell = data as import('../pte/taskData').RetellLectureItemData;
    if (retell.image ? typeof retell.imageAlt !== 'string' || !retell.imageAlt.trim() : retell.imageAlt !== undefined)
      invalid('taskData.imageAlt', 'A supporting image requires authored alt text, and alt text requires its image.');
  }
  if ('image' in data && data.image) {
    const expected = /\.png$/.test(data.image.path) ? 'image/png' : /\.webp$/.test(data.image.path) ? 'image/webp' : 'image/jpeg';
    if (data.image.mediaType !== expected) invalid('taskData.image.mediaType', 'Image MIME and extension disagree.');
  }
  if ('speakers' in data) {
    const ids = new Set(data.speakers.map(s => s.id));
    if (ids.size !== 3) invalid('taskData.speakers', 'Discussion needs three unique speaker IDs.');
    if (data.turns.some(t => !ids.has(t.speakerId)) || [...ids].some(id => !data.turns.some(t => t.speakerId === id))) invalid('taskData.turns', 'Turns must reference and represent all declared speakers.');
    if (task === 'summarize-group-discussion' && published && !('speakerPoints' in data && data.speakerPoints))
      invalid('taskData.speakerPoints', 'Published discussion content requires authored contribution points for each speaker.');
    if ('speakerPoints' in data && data.speakerPoints && (new Set(data.speakerPoints.map(s => s.speakerId)).size !== ids.size
      || data.speakerPoints.some(s => !ids.has(s.speakerId)) || [...ids].some(id => !data.speakerPoints?.some(s => s.speakerId === id))))
      invalid('taskData.speakerPoints', 'Speaker points must uniquely cover all declared speakers.');
  }
  if ('displayedTokens' in data) {
    if (new Set(data.displayedTokens.map(t => t.id)).size !== data.displayedTokens.length) invalid('taskData.displayedTokens', 'Token IDs must be unique.');
    if (!data.displayedTokens.some(t => t.incorrect)) invalid('taskData.displayedTokens', 'At least one incorrect token is required.');
    for (const token of data.displayedTokens) {
      if (token.incorrect ? !token.spokenText || token.spokenText === token.text : token.spokenText !== undefined && token.spokenText !== token.text)
        invalid('taskData.displayedTokens', 'Each incorrect token requires a different spokenText; correct tokens must retain their text.');
    }
    if (data.displayedTokens.map(t => t.spokenText ?? t.text).join(' ') !== data.spokenTranscript) invalid('taskData.spokenTranscript', 'Spoken token truth joined by single spaces must equal the authored transcript exactly.');
  }
  return data;
}
export function taskDataIssues(task: PteTaskType, value: unknown, published: boolean): { data?: Wave1TaskData; issues: readonly ContentValidationIssue[] } {
  try { return { data: parseTaskData(task, value, published), issues: [] }; }
  catch (error) { if (error instanceof ContentValidationError) return { issues: error.issues }; throw error; }
}
/** Narrow a historically loaded item using its expected task and authoritative parser. */
export function readTaskData<T extends import('../pte/taskRegistry').Wave1TaskType>(item: import('../pte/types').StudyItem, expected: T): import('../pte/taskData').StudyItemDataMap[T] {
  if (item.taskType !== expected) invalid('taskType', 'Unexpected task identity.');
  return parseTaskData(expected, item.taskData, item.status !== 'draft') as import('../pte/taskData').StudyItemDataMap[T];
}
