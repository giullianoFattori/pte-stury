import type { Attempt, ErrorRecord, StudyItem } from '../../../domain/pte/types.ts';
import type { AnswerShortQuestionScore } from '../../../domain/scoring/answer-short-question/types.ts';
import { readTaskData } from '../../../domain/content/taskDataValidation.ts';
export function buildAnswerShortQuestionErrorRecords(question: StudyItem, attempt: Attempt, score: AnswerShortQuestionScore): ErrorRecord[] {
  if (score.correct) return [];
  const omission = score.responseWordCount === 0;
  const expected = readTaskData(question, 'answer-short-question').acceptedAnswers[0];
  return [{ id: crypto.randomUUID(), attemptId: attempt.id, itemId: question.id, taskType: 'answer-short-question', skills: ['listening'], category: omission ? 'omission' : 'vocabulary', ...(omission ? {} : { actual: attempt.responseText }), expected, explanation: omission ? 'No answer was detected in the local transcript.' : 'The response did not match an authored accepted answer.', severity: 1, createdAt: attempt.createdAt }];
}
