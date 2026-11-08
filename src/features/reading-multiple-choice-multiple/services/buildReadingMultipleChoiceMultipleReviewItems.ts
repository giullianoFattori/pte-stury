import type { Attempt, ErrorRecord, ReviewItem, StudyItem } from '../../../domain/pte/types.ts';
import { readTaskData } from '../../../domain/content/taskDataValidation.ts';
import { createInitialReviewSchedule } from '../../../domain/scheduler/createInitialReviewSchedule.ts';
export function buildReadingMultipleChoiceMultipleReviewItems(item:StudyItem,attempt:Attempt,errors:readonly ErrorRecord[]):ReviewItem[]{
 if(item.taskType!=='reading-multiple-choice-multiple'||attempt.itemId!==item.id||attempt.taskType!==item.taskType)throw new Error('Invalid multiple choice review.');
 const data=readTaskData(item,'reading-multiple-choice-multiple');return errors.slice(0,3).map(error=>({id:crypto.randomUUID(),sourceAttemptId:attempt.id,sourceErrorId:error.id,itemId:item.id,taskType:item.taskType,type:'phrase',prompt:`${data.question} ${data.passage.slice(0,180)}…`,answer:error.category==='omission'?`Supported: ${error.expected}`:`Not supported: ${error.actual}`,...createInitialReviewSchedule(attempt.createdAt),createdAt:attempt.createdAt}));
}
