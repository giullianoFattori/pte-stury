import type { Attempt, ErrorRecord, ReviewItem, StudyItem } from '../../../domain/pte/types';
import { createInitialReviewSchedule } from '../../../domain/scheduler/createInitialReviewSchedule.ts';

type Input = {
  question: StudyItem;
  attempt: Attempt;
  errors: ErrorRecord[];
};

export function buildReadAloudReviewItems({ question, attempt, errors }: Input): ReviewItem[] {
  if (errors.length === 0) return [];
  const passage = question.transcript ?? question.answer;
  if (!passage) return [];
  return [{
    id: crypto.randomUUID(),
    sourceAttemptId: attempt.id,
    itemId: question.id,
    taskType: 'read-aloud',
    type: 'sentence',
    prompt: 'Read this passage aloud again, focusing on accurate words and smooth phrase groups.',
    answer: passage,
    ...createInitialReviewSchedule(attempt.createdAt),
    createdAt: attempt.createdAt,
  }];
}
