import type { Attempt, ErrorRecord, ReviewItem } from '../../../domain/pte/types.ts';
import { createInitialReviewSchedule } from '../../../domain/scheduler/createInitialReviewSchedule.ts';
export function buildSummarizeWrittenTextReviewItems(attempt:Attempt,errors:readonly ErrorRecord[]):ReviewItem[]{
  if(attempt.taskType!=='summarize-written-text')throw new Error('SWT reviews require an SWT attempt.');
  return errors.slice(0,3).map(error=>({id:crypto.randomUUID(),sourceAttemptId:attempt.id,sourceErrorId:error.id,itemId:attempt.itemId,taskType:'summarize-written-text',type:error.category==='form'?'sentence':'phrase',prompt:error.category==='form'?'Revise the response form: '+(error.expected??'one sentence of 5–75 words'):`Review this summary point: ${error.expected??error.token??''}`,answer:error.expected??error.token??'',...createInitialReviewSchedule(attempt.createdAt),createdAt:attempt.createdAt}));
}
