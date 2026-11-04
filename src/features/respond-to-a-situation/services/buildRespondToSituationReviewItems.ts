import type { Attempt, ErrorRecord, ReviewItem } from '../../../domain/pte/types';
import { createInitialReviewSchedule } from '../../../domain/scheduler/createInitialReviewSchedule.ts';
export function buildRespondToSituationReviewItems(attempt:Attempt,errors:readonly ErrorRecord[]):ReviewItem[]{
 return errors.slice(0,3).map(error=>({id:crypto.randomUUID(),sourceAttemptId:attempt.id,sourceErrorId:error.id,itemId:attempt.itemId,taskType:'respond-to-a-situation',type:'sentence',prompt:`Situation practice: ${error.expected??error.token??''}. What key point should your response include?`,answer:error.expected??error.token??'',...createInitialReviewSchedule(attempt.createdAt),createdAt:attempt.createdAt}));
}
