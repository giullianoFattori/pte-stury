import type { Attempt,ErrorRecord,ReviewItem } from '../../../domain/pte/types.ts';
import { createInitialReviewSchedule } from '../../../domain/scheduler/createInitialReviewSchedule.ts';
export function buildSummarizeSpokenTextReviewItems(attempt:Attempt,errors:readonly ErrorRecord[]):ReviewItem[]{
 if(attempt.taskType!=='summarize-spoken-text')throw new Error('SST reviews require an SST attempt.');
 return errors.slice(0,3).map(error=>({id:crypto.randomUUID(),sourceAttemptId:attempt.id,sourceErrorId:error.id,itemId:attempt.itemId,taskType:'summarize-spoken-text',type:error.category==='form'?'sentence':'phrase',prompt:error.category==='form'?'Revise the response form: '+(error.expected??'50–70 words for full credit'):`Review this lecture point: ${error.expected??error.token??''}`,answer:error.expected??error.token??'',...createInitialReviewSchedule(attempt.createdAt),createdAt:attempt.createdAt}));
}
