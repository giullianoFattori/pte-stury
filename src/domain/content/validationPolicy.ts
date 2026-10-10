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
  'tags', 'skills', 'topic', 'estimatedSeconds',
] as const);
export const BASE_REQUIRED_FIELDS = Object.freeze([
  'id', 'taskType', 'difficulty', 'prompt', 'revision', 'status', 'source',
] as const);
export const CONTENT_SKILLS = Object.freeze(['listening', 'reading', 'speaking', 'writing'] as const);
// Permanent grandfathering, not discovery from mutable production source arrays.
export const LEGACY_QUESTION_IDS = Object.freeze({
  'write-from-dictation': Object.freeze(['wfd-001', 'wfd-002', 'wfd-003', 'wfd-004', 'wfd-005']),
  'repeat-sentence': Object.freeze(['rs-001', 'rs-002', 'rs-003', 'rs-004', 'rs-005', 'rs-006']),
  'read-aloud': Object.freeze(['ra-001', 'ra-002', 'ra-003', 'ra-004', 'ra-005', 'ra-006']),
} satisfies Record<PteTaskType, readonly string[]>);
export const PUBLISHED_REQUIRED_FIELDS = Object.freeze({
  'write-from-dictation': Object.freeze(['answer', 'transcript', 'audio', 'skills']),
  'repeat-sentence': Object.freeze(['answer', 'transcript', 'audio', 'chunks', 'skills']),
  'read-aloud': Object.freeze(['answer', 'transcript', 'skills']),
} satisfies Record<PteTaskType, readonly string[]>);
// Explicit strict end assertion: JS $ alone also matches before a final newline.
export const AUDIO_PATH_PATTERN = '^/audio/(?:[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*$(?![\\s\\S])';
export const SHA256_PATTERN = '^[0-9a-f]{64}$(?![\\s\\S])';
export const AUDIO_MIME_PATTERN = '^audio/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$(?![\\s\\S])';
export function newQuestionIdPattern(task: PteTaskType): string {
  return `^${QUESTION_ID_PREFIXES[task]}-(?!000000)[0-9]{6}$(?![\\s\\S])`;
}
