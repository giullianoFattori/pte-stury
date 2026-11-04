import type { Attempt, ErrorRecord, StudyItem } from '../../../domain/pte/types';
import type { RespondToSituationCoverage } from '../../../domain/scoring/respond-to-a-situation';
export function buildRespondToSituationErrorRecords(question:StudyItem,attempt:Attempt,coverage:RespondToSituationCoverage):ErrorRecord[]{
 return coverage.requiredPointMatches.filter(match=>!match.matched).map(match=>({id:crypto.randomUUID(),attemptId:attempt.id,itemId:question.id,taskType:'respond-to-a-situation',skills:['speaking'],category:'omission',token:match.keyPoint,expected:match.keyPoint,explanation:'This required situation point was not detected in the locally transcribed response.',severity:1,createdAt:attempt.createdAt}));
}
