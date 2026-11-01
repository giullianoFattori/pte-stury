import type { Attempt, ErrorRecord, ReviewItem, StudyItem } from '../../../domain/pte/types.ts';
import { readTaskData } from '../../../domain/content/taskDataValidation.ts';
import { createInitialReviewSchedule } from '../../../domain/scheduler/createInitialReviewSchedule.ts';

export function buildReadingFillBlanksDropdownReviewItems(question: StudyItem, attempt: Attempt, errors: readonly ErrorRecord[]): ReviewItem[] {
  if (question.taskType !== 'reading-fill-blanks-dropdown' || attempt.taskType !== question.taskType || attempt.itemId !== question.id) throw new Error('Dropdown reviews must link to the correct item and Attempt.');
  const data = readTaskData(question, 'reading-fill-blanks-dropdown');
  return errors.slice(0, 4).map(error => {
    const index = error.expectedIndex ?? 0;
    const prompt = `${data.segments[index].slice(-100)}[____]${data.segments[index + 1].slice(0, 100)}`.replace(/\s+/gu, ' ').trim();
    return { id: crypto.randomUUID(), sourceAttemptId: attempt.id, sourceErrorId: error.id, itemId: question.id, taskType: question.taskType, type: 'phrase', prompt, answer: error.expected ?? '', ...createInitialReviewSchedule(attempt.createdAt), createdAt: attempt.createdAt };
  });
}
