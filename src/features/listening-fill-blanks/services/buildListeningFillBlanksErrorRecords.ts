import type { Attempt, ErrorCategory, ErrorRecord, Skill, StudyItem } from '../../../domain/pte/types.ts';
import { readTaskData } from '../../../domain/content/taskDataValidation.ts';
import { scoreListeningFillBlanks } from '../../../domain/scoring/listening-fill-blanks/index.ts';

function oneEditAway(a: string, b: string): boolean {
  const left = a.toLocaleLowerCase('en'), right = b.toLocaleLowerCase('en');
  if (left === right || Math.abs(left.length - right.length) > 1 || Math.min(left.length, right.length) < 4) return false;
  let i = 0, j = 0, edits = 0;
  while (i < left.length && j < right.length) { if (left[i] === right[j]) { i++; j++; continue; } if (++edits > 1) return false; if (left.length >= right.length) i++; if (right.length >= left.length) j++; }
  return edits + (i < left.length || j < right.length ? 1 : 0) <= 1;
}

export function buildListeningFillBlanksErrorRecords(question: StudyItem, attempt: Attempt): ErrorRecord[] {
  if (question.taskType !== 'listening-fill-blanks-type-in' || attempt.taskType !== question.taskType || attempt.itemId !== question.id || attempt.responseData?.kind !== 'blank-text') throw new Error('Listening blank errors must link to a typed-blank attempt for the correct item.');
  const data = readTaskData(question, 'listening-fill-blanks-type-in'), answers = attempt.responseData.answers;
  const results = scoreListeningFillBlanks(data.blanks, answers).results;
  const skills: Skill[] = ['listening'];
  return results.filter(result => !result.correct).map(result => {
    const index = data.blanks.findIndex(blank => blank.id === result.blankId);
    const category: ErrorCategory = result.unanswered ? 'omission' : oneEditAway(result.actual.trim(), result.expected) ? 'spelling' : 'listening-decoding';
    return { id: crypto.randomUUID(), attemptId: attempt.id, itemId: question.id, taskType: 'listening-fill-blanks-type-in' as const, skills,
      category,
      token: result.expected, expected: result.expected, actual: result.actual, expectedIndex: index, explanation: result.unanswered ? 'This blank was not answered.' : 'This response did not exactly match the authored word; spelling and word form are scored strictly.', severity: (result.unanswered ? 3 : 2) as 2 | 3, createdAt: attempt.createdAt };
  }).slice(0, 6);
}
