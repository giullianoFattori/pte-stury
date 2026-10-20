import type { Attempt, ErrorRecord, StudyItem } from '../../../domain/pte/types';
import type { SummarizeGroupDiscussionCoverage } from '../../../domain/scoring/summarize-group-discussion';

const ERROR_LIMIT = 6;
export function buildSummarizeGroupDiscussionErrorRecords(question: StudyItem, attempt: Attempt, coverage: SummarizeGroupDiscussionCoverage): ErrorRecord[] {
  const omissions: Array<{ token: string; expected: string; explanation: string }> = [];
  for (const speaker of coverage.speakerDetails) if (!speaker.represented) omissions.push({ token: speaker.label, expected: speaker.label, explanation: `A contribution from ${speaker.label} was not detected in the transcribed response.` });
  for (const point of coverage.keyPointMatches) if (!point.matched) omissions.push({ token: point.keyPoint, expected: point.keyPoint, explanation: 'This main discussion point was not detected in the transcribed response.' });
  for (const relationship of coverage.relationshipMatches ?? []) if (!relationship.matched) omissions.push({ token: relationship.keyPoint, expected: relationship.keyPoint, explanation: 'This speaker relationship was not detected in the transcribed response.' });
  return omissions.slice(0, ERROR_LIMIT).map(({ token, expected, explanation }) => ({ id: crypto.randomUUID(), attemptId: attempt.id, itemId: question.id,
    taskType: 'summarize-group-discussion', skills: ['listening','speaking'], category: 'omission', token, expected, explanation, severity: 1, createdAt: attempt.createdAt }));
}
