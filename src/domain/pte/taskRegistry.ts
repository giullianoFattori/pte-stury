import type { PteTaskType, Skill } from './types';
export type PteTaskDefinition = Readonly<{
  taskType: PteTaskType; label: string; skills: readonly Skill[];
  section: 'speaking-writing' | 'reading' | 'listening';
  wave: 'foundation' | 'wave-1' | 'wave-2'; practiceReady: boolean; idPrefix: string;
}>;
export const FOUNDATION_TASKS = Object.freeze(['write-from-dictation', 'repeat-sentence', 'read-aloud'] as const);
export const WAVE1_TASKS = Object.freeze(['retell-lecture', 'summarize-group-discussion', 'describe-image', 'summarize-written-text', 'summarize-spoken-text', 'highlight-incorrect-words'] as const);
export type FoundationTaskType = typeof FOUNDATION_TASKS[number];
export type Wave1TaskType = typeof WAVE1_TASKS[number];
export const KNOWN_TASK_ORDER = Object.freeze([...FOUNDATION_TASKS, ...WAVE1_TASKS]);
function definition(taskType: PteTaskType, label: string, skills: readonly Skill[], section: PteTaskDefinition['section'], idPrefix: string, practiceReady: boolean): PteTaskDefinition {
  return Object.freeze({ taskType, label, skills: Object.freeze([...skills]), section, idPrefix, practiceReady, wave: (FOUNDATION_TASKS as readonly PteTaskType[]).includes(taskType) ? 'foundation' : 'wave-1' });
}
export const TASK_REGISTRY: Readonly<Record<PteTaskType, PteTaskDefinition>> = Object.freeze({
  'write-from-dictation': definition('write-from-dictation', 'Write From Dictation', ['listening','writing'], 'listening', 'wfd', true),
  'repeat-sentence': definition('repeat-sentence', 'Repeat Sentence', ['listening','speaking'], 'speaking-writing', 'rs', true),
  'read-aloud': definition('read-aloud', 'Read Aloud', ['reading','speaking'], 'speaking-writing', 'ra', true),
  'retell-lecture': definition('retell-lecture', 'Retell Lecture', ['listening','speaking'], 'speaking-writing', 'rtl', true),
  'summarize-group-discussion': definition('summarize-group-discussion', 'Summarize Group Discussion', ['listening','speaking'], 'speaking-writing', 'sgd', true),
  'describe-image': definition('describe-image', 'Describe Image', ['speaking'], 'speaking-writing', 'di', true),
  'summarize-written-text': definition('summarize-written-text', 'Summarize Written Text', ['reading','writing'], 'speaking-writing', 'swt', true),
  'summarize-spoken-text': definition('summarize-spoken-text', 'Summarize Spoken Text', ['listening','writing'], 'listening', 'sst', true),
  'highlight-incorrect-words': definition('highlight-incorrect-words', 'Highlight Incorrect Words', ['listening','reading'], 'listening', 'hiw', false),
});
export const PRACTICE_TASK_ORDER = Object.freeze(KNOWN_TASK_ORDER.filter(task => TASK_REGISTRY[task].practiceReady));
/** Intentional MVP pool. Enabling another task never silently changes Quick. */
export const QUICK_TASK_POOL = Object.freeze([...FOUNDATION_TASKS]);
export function isKnownTaskType(value: unknown): value is PteTaskType { return typeof value === 'string' && Object.hasOwn(TASK_REGISTRY, value); }
export function isPracticeReadyTask(value: unknown): value is PteTaskType { return isKnownTaskType(value) && TASK_REGISTRY[value].practiceReady; }
export function taskRecord<T>(create: (task: PteTaskType) => T): Record<PteTaskType, T> {
  return Object.fromEntries(KNOWN_TASK_ORDER.map(task => [task, create(task)])) as Record<PteTaskType, T>;
}
export const TASK_LABELS = Object.freeze(taskRecord(task => TASK_REGISTRY[task].label));
export const TASK_ID_PREFIXES = Object.freeze(taskRecord(task => TASK_REGISTRY[task].idPrefix));
/** Identity association only: callers still validate permanent-ID syntax separately. */
export function taskTypeForItemId(id: string): PteTaskType | undefined {
  return KNOWN_TASK_ORDER.find(task => id.startsWith(TASK_REGISTRY[task].idPrefix + '-'));
}
