import type { PteTaskType, Skill } from './types';
export type PteTaskDefinition = Readonly<{
  taskType: PteTaskType; label: string; skills: readonly Skill[];
  section: 'speaking-writing' | 'reading' | 'listening';
  wave: 'foundation' | 'wave-1' | 'wave-2'; practiceReady: boolean; idPrefix: string;
}>;
export const FOUNDATION_TASKS = Object.freeze(['write-from-dictation', 'repeat-sentence', 'read-aloud'] as const);
export const WAVE1_TASKS = Object.freeze(['retell-lecture', 'summarize-group-discussion', 'describe-image', 'summarize-written-text', 'summarize-spoken-text', 'highlight-incorrect-words'] as const);
export const WAVE2_TASKS = Object.freeze([
  'listening-fill-blanks-type-in', 'reading-fill-blanks-dropdown', 'reading-fill-blanks-drag-drop', 'reorder-paragraph',
  'respond-to-a-situation', 'write-essay', 'answer-short-question', 'reading-multiple-choice-multiple',
  'listening-multiple-choice-multiple', 'reading-multiple-choice-single', 'listening-multiple-choice-single',
  'highlight-correct-summary', 'select-missing-word',
] as const);
export type FoundationTaskType = typeof FOUNDATION_TASKS[number];
export type Wave1TaskType = typeof WAVE1_TASKS[number];
export type Wave2TaskType = typeof WAVE2_TASKS[number];
export type TaskDataTaskType = Wave1TaskType | Wave2TaskType;

/** Current scored catalogue order by Pearson section; Personal Introduction is excluded. */
export const OFFICIAL_PTE_TASK_ORDER = Object.freeze([
  'read-aloud','repeat-sentence','describe-image','retell-lecture','answer-short-question','summarize-group-discussion','respond-to-a-situation','summarize-written-text','write-essay',
  'reading-fill-blanks-dropdown','reading-multiple-choice-multiple','reorder-paragraph','reading-fill-blanks-drag-drop','reading-multiple-choice-single',
  'summarize-spoken-text','listening-multiple-choice-multiple','listening-fill-blanks-type-in','highlight-correct-summary','listening-multiple-choice-single','select-missing-word','highlight-incorrect-words','write-from-dictation',
] as const satisfies readonly PteTaskType[]);
export const IMPLEMENTATION_TASK_ORDER = Object.freeze([...FOUNDATION_TASKS, ...WAVE1_TASKS, ...WAVE2_TASKS]);
/** Backward-compatible name: this is the full known catalogue, not the practice selector. */
export const KNOWN_TASK_ORDER = IMPLEMENTATION_TASK_ORDER;
function definition(taskType: PteTaskType, label: string, skills: readonly Skill[], section: PteTaskDefinition['section'], idPrefix: string, practiceReady: boolean): PteTaskDefinition {
  const wave = (FOUNDATION_TASKS as readonly PteTaskType[]).includes(taskType) ? 'foundation' : (WAVE1_TASKS as readonly PteTaskType[]).includes(taskType) ? 'wave-1' : 'wave-2';
  return Object.freeze({ taskType, label, skills: Object.freeze([...skills]), section, idPrefix, practiceReady, wave });
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
  'highlight-incorrect-words': definition('highlight-incorrect-words', 'Highlight Incorrect Words', ['listening','reading'], 'listening', 'hiw', true),
  'answer-short-question': definition('answer-short-question', 'Answer Short Question', ['listening'], 'speaking-writing', 'asq', false),
  'respond-to-a-situation': definition('respond-to-a-situation', 'Respond to a Situation', ['speaking'], 'speaking-writing', 'rts', true),
  'write-essay': definition('write-essay', 'Write Essay', ['writing'], 'speaking-writing', 'we', false),
  'reading-fill-blanks-dropdown': definition('reading-fill-blanks-dropdown', 'Reading: Fill in the Blanks — Dropdown', ['reading'], 'reading', 'rfbd', true),
  'reading-multiple-choice-multiple': definition('reading-multiple-choice-multiple', 'Reading: Multiple Choice — Multiple Answers', ['reading'], 'reading', 'rmcm', false),
  'reorder-paragraph': definition('reorder-paragraph', 'Reorder Paragraph', ['reading'], 'reading', 'rop', true),
  'reading-fill-blanks-drag-drop': definition('reading-fill-blanks-drag-drop', 'Reading: Fill in the Blanks — Drag and Drop', ['reading'], 'reading', 'rfbdd', true),
  'reading-multiple-choice-single': definition('reading-multiple-choice-single', 'Reading: Multiple Choice — Single Answer', ['reading'], 'reading', 'rmcs', false),
  'listening-multiple-choice-multiple': definition('listening-multiple-choice-multiple', 'Listening: Multiple Choice — Multiple Answers', ['listening'], 'listening', 'lmcm', false),
  'listening-fill-blanks-type-in': definition('listening-fill-blanks-type-in', 'Listening: Fill in the Blanks — Type In', ['listening'], 'listening', 'lfb', true),
  'highlight-correct-summary': definition('highlight-correct-summary', 'Highlight Correct Summary', ['listening','reading'], 'listening', 'hcs', false),
  'listening-multiple-choice-single': definition('listening-multiple-choice-single', 'Listening: Multiple Choice — Single Answer', ['listening'], 'listening', 'lmcs', false),
  'select-missing-word': definition('select-missing-word', 'Select Missing Word', ['listening'], 'listening', 'smw', false),
});
export const PRACTICE_TASK_ORDER = Object.freeze(IMPLEMENTATION_TASK_ORDER.filter(task => TASK_REGISTRY[task].practiceReady));
/** Intentional short foundation pool. New readiness never silently changes Quick. */
export const QUICK_TASK_POOL = Object.freeze([...FOUNDATION_TASKS]);
export function isKnownTaskType(value: unknown): value is PteTaskType { return typeof value === 'string' && Object.hasOwn(TASK_REGISTRY, value); }
export function isPracticeReadyTask(value: unknown): value is PteTaskType { return isKnownTaskType(value) && TASK_REGISTRY[value].practiceReady; }
export function taskRecord<T>(create: (task: PteTaskType) => T): Record<PteTaskType, T> {
  return Object.fromEntries(IMPLEMENTATION_TASK_ORDER.map(task => [task, create(task)])) as Record<PteTaskType, T>;
}
export const TASK_LABELS = Object.freeze(taskRecord(task => TASK_REGISTRY[task].label));
export const TASK_ID_PREFIXES = Object.freeze(taskRecord(task => TASK_REGISTRY[task].idPrefix));
/** Identity association only: callers still validate permanent-ID syntax separately. */
export function taskTypeForItemId(id: string): PteTaskType | undefined {
  return IMPLEMENTATION_TASK_ORDER.find(task => id.startsWith(TASK_REGISTRY[task].idPrefix + '-'));
}
