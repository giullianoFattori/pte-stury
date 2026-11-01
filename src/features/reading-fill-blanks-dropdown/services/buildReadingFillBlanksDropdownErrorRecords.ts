import type { Attempt, ErrorRecord, StudyItem } from '../../../domain/pte/types.ts';
import { readTaskData } from '../../../domain/content/taskDataValidation.ts';
import { scoreReadingFillBlanksDropdown } from '../../../domain/scoring/reading-fill-blanks-dropdown/index.ts';

export function buildReadingFillBlanksDropdownErrorRecords(question: StudyItem, attempt: Attempt): ErrorRecord[] {
  if (question.taskType !== 'reading-fill-blanks-dropdown' || attempt.taskType !== question.taskType || attempt.itemId !== question.id || attempt.responseData?.kind !== 'blank-choice') throw new Error('Dropdown errors must link to a blank-choice Attempt for this item.');
  const data = readTaskData(question, 'reading-fill-blanks-dropdown');
  return scoreReadingFillBlanksDropdown(data.blanks, attempt.responseData.answers).results.filter(result => !result.correct).slice(0, 6).map(result => {
    const index = data.blanks.findIndex(blank => blank.id === result.blankId);
    return { id: crypto.randomUUID(), attemptId: attempt.id, itemId: question.id, taskType: question.taskType, skills: ['reading'], category: result.unanswered ? 'omission' : 'vocabulary', token: result.expected, expected: result.expected, actual: result.actual, expectedIndex: index, explanation: result.unanswered ? 'This blank was not answered.' : 'This selected option does not match the authored answer for this blank.', severity: result.unanswered ? 3 : 2, createdAt: attempt.createdAt };
  });
}
