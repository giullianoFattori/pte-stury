import type { Attempt, StudyItem } from '../../../domain/pte/types.ts';
import { readTaskData } from '../../../domain/content/taskDataValidation.ts';
import { scoreReadingFillBlanksDragDrop } from '../../../domain/scoring/reading-fill-blanks-drag-drop/index.ts';

export function buildReadingFillBlanksDragDropAttempt(input: { question: StudyItem; assignments: Readonly<Record<string, string>>; durationMs: number }): Attempt {
  const { question, assignments, durationMs } = input;
  if (question.taskType !== 'reading-fill-blanks-drag-drop') throw new Error('Only Reading Fill in the Blanks — Drag and Drop items can use this builder.');
  if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 86_400_000) throw new Error('Drag-and-drop practice duration must be finite and within one practice day.');
  const data = readTaskData(question, 'reading-fill-blanks-drag-drop');
  const score = scoreReadingFillBlanksDragDrop(data.blanks, assignments, data.wordBank);
  const metrics = { rawScore: score.rawScore, maxScore: score.maxScore, correctBlanks: score.correctCount, incorrectBlanks: score.incorrectCount, unansweredBlanks: score.unansweredCount, totalBlanks: score.totalBlanks, accuracy: score.accuracy, accuracyPercent: score.accuracyPercent, exactAllCorrect: score.exactAllCorrect };
  return { id: crypto.randomUUID(), itemId: question.id, taskType: question.taskType, ...(question.revision === undefined ? {} : { itemRevision: question.revision }), createdAt: new Date().toISOString(), durationMs, score: score.accuracy, metrics, responseData: Object.freeze({ kind: 'blank-choice' as const, answers: Object.freeze({ ...assignments }) }) };
}
