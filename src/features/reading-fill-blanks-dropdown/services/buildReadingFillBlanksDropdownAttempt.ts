import type { Attempt, StudyItem } from '../../../domain/pte/types.ts';
import { readTaskData } from '../../../domain/content/taskDataValidation.ts';
import { scoreReadingFillBlanksDropdown } from '../../../domain/scoring/reading-fill-blanks-dropdown/index.ts';

export function buildReadingFillBlanksDropdownAttempt(input: { question: StudyItem; answers: Readonly<Record<string, string>>; durationMs: number }): Attempt {
  const { question, answers, durationMs } = input;
  if (question.taskType !== 'reading-fill-blanks-dropdown') throw new Error('Only Reading Fill in the Blanks — Dropdown items can use this builder.');
  if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 86_400_000) throw new Error('Dropdown practice duration must be finite and within one practice day.');
  const data = readTaskData(question, 'reading-fill-blanks-dropdown');
  const score = scoreReadingFillBlanksDropdown(data.blanks, answers);
  const metrics = { rawScore: score.rawScore, maxScore: score.maxScore, correctBlanks: score.correctCount, incorrectBlanks: score.incorrectCount, unansweredBlanks: score.unansweredCount, totalBlanks: score.totalBlanks, accuracy: score.accuracy, accuracyPercent: score.accuracyPercent, exactAllCorrect: score.exactAllCorrect };
  return { id: crypto.randomUUID(), itemId: question.id, taskType: question.taskType, ...(question.revision === undefined ? {} : { itemRevision: question.revision }), createdAt: new Date().toISOString(), durationMs, score: score.accuracy, metrics, responseData: Object.freeze({ kind: 'blank-choice' as const, answers: Object.freeze({ ...answers }) }) };
}
