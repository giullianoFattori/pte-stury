import type { Attempt, ErrorRecord, StudyItem } from '../../../domain/pte/types';
import type { RetellLectureCoverage } from '../../../domain/scoring/retell-lecture';
export function buildRetellLectureErrorRecords(question: StudyItem, attempt: Attempt, coverage: RetellLectureCoverage): ErrorRecord[] {
  return coverage.matches.filter(match => !match.matched).map(match => ({ id: crypto.randomUUID(), attemptId: attempt.id, itemId: question.id, taskType: 'retell-lecture', skills: ['listening','speaking'], category: 'omission', token: match.keyPoint, expected: match.keyPoint, explanation: 'This key point was not detected in the transcribed response.', severity: 1, createdAt: attempt.createdAt }));
}
