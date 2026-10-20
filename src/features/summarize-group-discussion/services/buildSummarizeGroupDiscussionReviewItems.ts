import type { Attempt, ErrorRecord, ReviewItem } from '../../../domain/pte/types';
import { createInitialReviewSchedule } from '../../../domain/scheduler/createInitialReviewSchedule.ts';

export function buildSummarizeGroupDiscussionReviewItems(attempt: Attempt, errors: readonly ErrorRecord[]): ReviewItem[] {
  return errors.slice(0, 3).map(error => ({ id: crypto.randomUUID(), sourceAttemptId: attempt.id, sourceErrorId: error.id, itemId: attempt.itemId,
    taskType: 'summarize-group-discussion', type: 'phrase', prompt: `Summarize this discussion point: ${error.expected ?? error.token ?? ''}`,
    answer: error.expected ?? error.token ?? '', ...createInitialReviewSchedule(attempt.createdAt), createdAt: attempt.createdAt }));
}
