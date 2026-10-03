import type { Attempt, ErrorRecord, ReviewItem, StudyItem } from '../../../domain/pte/types';
import { createInitialReviewSchedule } from '../../../domain/scheduler/createInitialReviewSchedule.ts';

type Input = {
  question: StudyItem;
  attempt: Attempt;
  errors: ErrorRecord[];
};

export function buildRepeatSentenceReviewItems({ question, attempt, errors }: Input): ReviewItem[] {
  if (errors.length === 0) return [];
  const expectedSentence = question.transcript ?? question.answer;
  if (!expectedSentence) return [];
  return [{
    id: crypto.randomUUID(),
    sourceAttemptId: attempt.id,
    itemId: question.id,
    taskType: 'repeat-sentence',
    type: 'sentence',
    prompt: 'Listen to the original Repeat Sentence audio and repeat the sentence accurately.',
    answer: expectedSentence,
    ...createInitialReviewSchedule(attempt.createdAt),
    createdAt: attempt.createdAt,
  }];
}
