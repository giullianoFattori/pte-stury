import type { Attempt, ErrorRecord, ReviewItem, StudyItem } from '../../../domain/pte/types.ts';
import { readTaskData } from '../../../domain/content/taskDataValidation.ts';
import { createInitialReviewSchedule } from '../../../domain/scheduler/createInitialReviewSchedule.ts';
export function buildAnswerShortQuestionReviewItems(question: StudyItem, attempt: Attempt, errors: ErrorRecord[]): ReviewItem[] {
  if (!errors.length) return [];
  const answer = readTaskData(question, 'answer-short-question').acceptedAnswers[0];
  return [{ id: crypto.randomUUID(), sourceAttemptId: attempt.id, itemId: question.id, taskType: 'answer-short-question', type: 'phrase', prompt: question.prompt, answer, ...createInitialReviewSchedule(attempt.createdAt), createdAt: attempt.createdAt }];
}
