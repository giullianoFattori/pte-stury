import type{Attempt,ErrorRecord,ReviewItem,StudyItem}from'../../../domain/pte/types.ts';
import{readTaskData}from'../../../domain/content/taskDataValidation.ts';
import{createInitialReviewSchedule}from'../../../domain/scheduler/createInitialReviewSchedule.ts';
const MAX_HIW_REVIEWS=4;
export function buildHighlightIncorrectWordsReviewItems(question:StudyItem,attempt:Attempt,errors:readonly ErrorRecord[]):ReviewItem[]{
 if(question.taskType!=='highlight-incorrect-words'||attempt.taskType!==question.taskType||attempt.itemId!==question.id)throw new Error('HIW reviews must link to the correct item and attempt.');
 const data=readTaskData(question,'highlight-incorrect-words'),byId=new Map(data.displayedTokens.map((token,index)=>[token.id,{token,index}])),targets=[...(attempt.responseData?.missedTokenIds??[]),...(attempt.responseData?.falsePositiveTokenIds??[])].slice(0,MAX_HIW_REVIEWS),errorByToken=new Map(errors.map(error=>[`${error.expectedIndex}`,error]));
 const createdAt=attempt.createdAt;
 return targets.flatMap(id=>{const found=byId.get(id);if(!found)return[];const{token,index}=found,before=data.displayedTokens.slice(Math.max(0,index-3),index).map(t=>t.text),after=data.displayedTokens.slice(index+1,index+4).map(t=>t.text),context=[...before,token.text,...after].join(' '),truth=token.incorrect?token.spokenText!:token.text,error=errorByToken.get(String(index));return[{id:crypto.randomUUID(),sourceAttemptId:attempt.id,...(error?{sourceErrorId:error.id}:{}),itemId:question.id,taskType:'highlight-incorrect-words' as const,type:'phrase' as const,prompt:`Review this audio transcript context: “${context}”`,answer:token.incorrect?`Displayed “${token.text}”; audio “${truth}”.`:`“${token.text}” matched the audio and should not have been selected.`,...createInitialReviewSchedule(createdAt),createdAt}];});
}
