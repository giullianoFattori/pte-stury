import type { Attempt, ErrorRecord, ReviewItem, StudyItem } from '../../../domain/pte/types.ts';
import { readTaskData } from '../../../domain/content/taskDataValidation.ts';
import { createInitialReviewSchedule } from '../../../domain/scheduler/createInitialReviewSchedule.ts';

export function buildListeningFillBlanksReviewItems(question: StudyItem, attempt: Attempt, errors: readonly ErrorRecord[]): ReviewItem[] {
  if (question.taskType !== 'listening-fill-blanks-type-in' || attempt.taskType !== question.taskType || attempt.itemId !== question.id) throw new Error('Listening blank reviews must link to the correct item and attempt.');
  const data = readTaskData(question, 'listening-fill-blanks-type-in');
  return errors.slice(0, 4).map(error => {
    const index = error.expectedIndex ?? 0;
    const prompt = `${data.transcriptSegments[index]}[____]${data.transcriptSegments[index + 1]}`.replace(/\s+/g, ' ').trim();
    return { id: crypto.randomUUID(), sourceAttemptId: attempt.id, sourceErrorId: error.id, itemId: question.id, taskType: question.taskType, type: 'phrase', prompt, answer: error.expected ?? '', ...createInitialReviewSchedule(attempt.createdAt), createdAt: attempt.createdAt };
  });
}
