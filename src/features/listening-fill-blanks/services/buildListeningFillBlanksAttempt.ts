import type { Attempt, StudyItem } from '../../../domain/pte/types.ts';
import { readTaskData } from '../../../domain/content/taskDataValidation.ts';
import { scoreListeningFillBlanks } from '../../../domain/scoring/listening-fill-blanks/index.ts';

export function buildListeningFillBlanksAttempt(input: { question: StudyItem; answers: Readonly<Record<string, string>>; durationMs: number; sourcePlaybackStarted: boolean }): Attempt {
  const { question, answers, durationMs, sourcePlaybackStarted } = input;
  if (question.taskType !== 'listening-fill-blanks-type-in') throw new Error('Only Listening Fill in the Blanks — Type In items can be scored by this builder.');
  if (sourcePlaybackStarted !== true) throw new Error('The source audio must have started before saving this attempt.');
  if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 86_400_000) throw new Error('Listening Fill in the Blanks duration must be finite and within one practice day.');
  const data = readTaskData(question, 'listening-fill-blanks-type-in');
  const score = scoreListeningFillBlanks(data.blanks, answers);
  const metrics = { rawScore: score.rawScore, maxScore: score.maxScore, correctBlanks: score.correctCount, incorrectBlanks: score.incorrectCount, unansweredBlanks: score.unansweredCount, totalBlanks: score.totalBlanks, accuracy: score.accuracy, accuracyPercent: score.accuracyPercent, exactAllCorrect: score.exactAllCorrect, sourcePlaybackStarted: true };
  for (const [key, value] of Object.entries(metrics)) if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) throw new Error(`Invalid Listening Fill in the Blanks metric: ${key}.`);
  return { id: crypto.randomUUID(), itemId: question.id, taskType: 'listening-fill-blanks-type-in', ...(question.revision === undefined ? {} : { itemRevision: question.revision }), createdAt: new Date().toISOString(), durationMs, score: score.accuracy, metrics, responseData: Object.freeze({ kind: 'blank-text' as const, answers: Object.freeze({ ...answers }) }) };
}
