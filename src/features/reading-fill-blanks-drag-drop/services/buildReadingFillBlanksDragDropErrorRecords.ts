import type { Attempt, ErrorRecord, StudyItem } from '../../../domain/pte/types.ts';
import { readTaskData } from '../../../domain/content/taskDataValidation.ts';
import { scoreReadingFillBlanksDragDrop } from '../../../domain/scoring/reading-fill-blanks-drag-drop/index.ts';

export function buildReadingFillBlanksDragDropErrorRecords(question: StudyItem, attempt: Attempt): ErrorRecord[] {
  if (question.taskType !== 'reading-fill-blanks-drag-drop' || attempt.taskType !== question.taskType || attempt.itemId !== question.id || attempt.responseData?.kind !== 'blank-choice') throw new Error('Drag-and-drop errors must link to a blank-choice Attempt for this item.');
  const data = readTaskData(question, 'reading-fill-blanks-drag-drop');
  return scoreReadingFillBlanksDragDrop(data.blanks, attempt.responseData.answers, data.wordBank).results.filter(result => !result.correct).slice(0, 6).map(result => {
    const index = data.blanks.findIndex(blank => blank.id === result.blankId);
    return { id: crypto.randomUUID(), attemptId: attempt.id, itemId: question.id, taskType: question.taskType, skills: ['reading'], category: result.unanswered ? 'omission' : 'vocabulary', token: result.expected, expected: result.expected, actual: result.actual, expectedIndex: index, explanation: result.unanswered ? 'This blank was not answered.' : 'This word-bank choice does not match the authored answer for this blank.', severity: result.unanswered ? 3 : 2, createdAt: attempt.createdAt };
  });
}
