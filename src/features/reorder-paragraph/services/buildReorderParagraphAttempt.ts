import type { Attempt, StudyItem } from '../../../domain/pte/types.ts';
import { readTaskData } from '../../../domain/content/taskDataValidation.ts';
import { scoreReorderParagraph } from '../../../domain/scoring/reorder-paragraph/index.ts';

export function buildReorderParagraphAttempt(input: { question: StudyItem; responseOrder: readonly string[]; durationMs: number }): Attempt {
  const { question, responseOrder, durationMs } = input;
  if (question.taskType !== 'reorder-paragraph') throw new Error('Only Reorder Paragraph items can use this builder.');
  if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 86_400_000) throw new Error('Reorder Paragraph duration must be finite and within one practice day.');
  const data = readTaskData(question, 'reorder-paragraph'), score = scoreReorderParagraph(data.correctOrder, responseOrder);
  const metrics = { rawScore: score.rawScore, maxScore: score.maxScore, correctAdjacentPairs: score.correctAdjacentPairs, totalAdjacentPairs: score.totalAdjacentPairs, accuracy: score.accuracy, accuracyPercent: score.accuracyPercent, exactOrder: score.exactOrder, firstBlockCorrect: score.firstBlockCorrect };
  return { id: crypto.randomUUID(), itemId: question.id, taskType: question.taskType, ...(question.revision === undefined ? {} : { itemRevision: question.revision }), createdAt: new Date().toISOString(), durationMs, score: score.accuracy, metrics, responseData: Object.freeze({ kind: 'ordered-blocks' as const, blockIds: Object.freeze([...responseOrder]) }) };
}
