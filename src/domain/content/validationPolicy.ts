import { QUESTION_ID_PREFIXES } from './types.ts';
import type { PteTaskType } from '../pte/types';

export const CONTENT_LIMITS = Object.freeze({
  id: 64, text: 10000, topic: 200, tag: 100, entry: 1000,
  tags: 50, entries: 200, audioPath: 512, mimeType: 100,
  batchItems: 10000, jsonDepth: 64, jsonCodeUnits: 2 * 1024 * 1024,
});
export const CONTENT_FIELDS = Object.freeze([
  'id', 'taskType', 'difficulty', 'prompt', 'answer', 'transcript', 'audio',
  'chunks', 'phraseGroups', 'stressWords', 'revision', 'status', 'source',
  'tags', 'skills', 'topic', 'estimatedSeconds', 'taskData',
] as const);
export const BASE_REQUIRED_FIELDS = Object.freeze([
  'id', 'taskType', 'difficulty', 'prompt', 'revision', 'status', 'source',
] as const);
export const CONTENT_SKILLS = Object.freeze(['listening', 'reading', 'speaking', 'writing'] as const);
// Permanent grandfathering, not discovery from mutable production source arrays.
export const LEGACY_QUESTION_IDS: Readonly<Record<PteTaskType, readonly string[]>> = Object.freeze({
  'write-from-dictation': Object.freeze(['wfd-001', 'wfd-002', 'wfd-003', 'wfd-004', 'wfd-005']),
  'repeat-sentence': Object.freeze(['rs-001', 'rs-002', 'rs-003', 'rs-004', 'rs-005', 'rs-006']),
  'read-aloud': Object.freeze(['ra-001', 'ra-002', 'ra-003', 'ra-004', 'ra-005', 'ra-006']),
  'retell-lecture': Object.freeze([]),
  'summarize-group-discussion': Object.freeze([]),
  'describe-image': Object.freeze([]),
  'summarize-written-text': Object.freeze([]),
  'summarize-spoken-text': Object.freeze([]),
  'highlight-incorrect-words': Object.freeze([]),
  'answer-short-question': Object.freeze([]),
  'respond-to-a-situation': Object.freeze([]),
  'write-essay': Object.freeze([]),
  'reading-fill-blanks-dropdown': Object.freeze([]),
  'reading-multiple-choice-multiple': Object.freeze([]),
  'reorder-paragraph': Object.freeze([]),
  'reading-fill-blanks-drag-drop': Object.freeze([]),
  'reading-multiple-choice-single': Object.freeze([]),
  'listening-multiple-choice-multiple': Object.freeze([]),
  'listening-fill-blanks-type-in': Object.freeze([]),
  'highlight-correct-summary': Object.freeze([]),
  'listening-multiple-choice-single': Object.freeze([]),
  'select-missing-word': Object.freeze([]),
} satisfies Record<PteTaskType, readonly string[]>);
export const PUBLISHED_REQUIRED_FIELDS = Object.freeze({
  'write-from-dictation': Object.freeze(['answer', 'transcript', 'audio', 'skills']),
  'repeat-sentence': Object.freeze(['answer', 'transcript', 'audio', 'chunks', 'skills']),
  'read-aloud': Object.freeze(['answer', 'transcript', 'skills']),
  'retell-lecture': Object.freeze(['taskData', 'skills']),
  'summarize-group-discussion': Object.freeze(['taskData', 'skills']),
  'describe-image': Object.freeze(['taskData', 'skills']),
  'summarize-written-text': Object.freeze(['taskData', 'skills']),
  'summarize-spoken-text': Object.freeze(['taskData', 'skills']),
  'highlight-incorrect-words': Object.freeze(['taskData', 'skills']),
  'answer-short-question': Object.freeze(['taskData', 'skills']),
  'respond-to-a-situation': Object.freeze(['taskData', 'skills']),
  'write-essay': Object.freeze(['taskData', 'skills']),
  'reading-fill-blanks-dropdown': Object.freeze(['taskData', 'skills']),
  'reading-multiple-choice-multiple': Object.freeze(['taskData', 'skills']),
  'reorder-paragraph': Object.freeze(['taskData', 'skills']),
  'reading-fill-blanks-drag-drop': Object.freeze(['taskData', 'skills']),
  'reading-multiple-choice-single': Object.freeze(['taskData', 'skills']),
  'listening-multiple-choice-multiple': Object.freeze(['taskData', 'skills']),
  'listening-fill-blanks-type-in': Object.freeze(['taskData', 'skills']),
  'highlight-correct-summary': Object.freeze(['taskData', 'skills']),
  'listening-multiple-choice-single': Object.freeze(['taskData', 'skills']),
  'select-missing-word': Object.freeze(['taskData', 'skills']),
} satisfies Record<PteTaskType, readonly string[]>);
// Explicit strict end assertion: JS $ alone also matches before a final newline.
export const AUDIO_PATH_PATTERN = '^/audio/(?:[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*$(?![\\s\\S])';
export const SHA256_PATTERN = '^[0-9a-f]{64}$(?![\\s\\S])';
export const AUDIO_MIME_PATTERN = '^audio/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$(?![\\s\\S])';
export function newQuestionIdPattern(task: PteTaskType): string {
  return `^${QUESTION_ID_PREFIXES[task]}-(?!000000)[0-9]{6}$(?![\\s\\S])`;
}
