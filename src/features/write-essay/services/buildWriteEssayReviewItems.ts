import type { Attempt, ErrorRecord, ReviewItem } from '../../../domain/pte/types.ts';
import { createInitialReviewSchedule } from '../../../domain/scheduler/createInitialReviewSchedule.ts';
export function buildWriteEssayReviewItems(attempt:Attempt,errors:readonly ErrorRecord[]):ReviewItem[]{
 if(attempt.taskType!=='write-essay')throw new Error('Write Essay reviews require a Write Essay attempt.');
 return errors.slice(0,3).map(error=>({id:crypto.randomUUID(),sourceAttemptId:attempt.id,sourceErrorId:error.id,itemId:attempt.itemId,taskType:'write-essay',type:error.category==='form'?'sentence':'phrase',prompt:error.category==='form'?'Review the essay length and Form requirements.':`Plan how to address this prompt requirement: ${error.expected??error.token??''}`,answer:error.expected??error.token??'',...createInitialReviewSchedule(attempt.createdAt),createdAt:attempt.createdAt}));
}
