import type { Attempt, ErrorRecord, ReviewItem, StudyItem } from '../../../domain/pte/types.ts';
import { readTaskData } from '../../../domain/content/taskDataValidation.ts';
import { createInitialReviewSchedule } from '../../../domain/scheduler/createInitialReviewSchedule.ts';

export function buildReorderParagraphReviewItems(question: StudyItem, attempt: Attempt, errors: readonly ErrorRecord[]): ReviewItem[] {
  if (question.taskType !== 'reorder-paragraph' || attempt.taskType !== question.taskType || attempt.itemId !== question.id || attempt.responseData?.kind !== 'ordered-blocks') throw new Error('Reorder Paragraph reviews must link to the correct Attempt.');
  const data = readTaskData(question, 'reorder-paragraph'), byText = new Map(data.blocks.map(block => [block.text, block.id]));
  return errors.slice(0, 3).map(error => {
    const leftId = byText.get(error.token ?? ''), rightId = data.correctOrder[data.correctOrder.indexOf(leftId ?? '') + 1];
    const prompt = `Which sentence should come directly after: “${error.token ?? ''}”`;
    return { id: crypto.randomUUID(), sourceAttemptId: attempt.id, sourceErrorId: error.id, itemId: question.id, taskType: question.taskType, type: 'sentence', prompt, answer: rightId ? data.blocks.find(block => block.id === rightId)!.text : 'The paragraph ends.', ...createInitialReviewSchedule(attempt.createdAt), createdAt: attempt.createdAt };
  });
}
