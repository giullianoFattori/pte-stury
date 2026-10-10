import type { QuestionBankItem, QuestionBankBundle } from './types.ts';
import { QUESTION_BANK_SCHEMA_VERSION } from './types.ts';

export const TASK_ORDER = Object.freeze(['write-from-dictation', 'repeat-sentence', 'read-aloud'] as const);
export const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
/** Shared browser/build semantics; local installation fields and aliases are excluded. */
export function canonicalItem(item: QuestionBankItem): QuestionBankItem {
  return {
    id: item.id, taskType: item.taskType, difficulty: item.difficulty, prompt: item.prompt,
    ...(item.answer === undefined ? {} : { answer: item.answer }),
    ...(item.transcript === undefined ? {} : { transcript: item.transcript }),
    ...(item.audio === undefined ? {} : { audio: {
      path: item.audio.path,
      ...(item.audio.sha256 === undefined ? {} : { sha256: item.audio.sha256 }),
      ...(item.audio.durationMs === undefined ? {} : { durationMs: item.audio.durationMs }),
      ...(item.audio.mimeType === undefined ? {} : { mimeType: item.audio.mimeType }),
    } }),
    ...(item.chunks === undefined ? {} : { chunks: [...item.chunks] }),
    ...(item.phraseGroups === undefined ? {} : { phraseGroups: [...item.phraseGroups] }),
    ...(item.stressWords === undefined ? {} : { stressWords: [...item.stressWords] }),
    revision: item.revision, status: item.status, source: item.source,
    ...(item.tags === undefined ? {} : { tags: [...item.tags].sort(compare) }),
    ...(item.skills === undefined ? {} : { skills: [...item.skills].sort(compare) }),
    ...(item.topic === undefined ? {} : { topic: item.topic }),
    ...(item.estimatedSeconds === undefined ? {} : { estimatedSeconds: item.estimatedSeconds }),
  };
}
export function canonicalBundle(items: readonly QuestionBankItem[]): QuestionBankBundle {
  return { schemaVersion: QUESTION_BANK_SCHEMA_VERSION, items: [...items]
    .sort((a, b) => TASK_ORDER.indexOf(a.taskType) - TASK_ORDER.indexOf(b.taskType) || compare(a.id, b.id))
    .map(canonicalItem) };
}
