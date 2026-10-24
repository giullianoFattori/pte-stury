import type { Attempt,ErrorRecord,Skill,StudyItem } from '../../../domain/pte/types.ts';
import type { SstAnalysis } from '../../../domain/scoring/summarize-spoken-text/types.ts';
export function buildSummarizeSpokenTextErrorRecords(question:StudyItem,attempt:Attempt,analysis:SstAnalysis):ErrorRecord[]{
 if(question.taskType!=='summarize-spoken-text'||attempt.taskType!=='summarize-spoken-text'||attempt.itemId!==question.id)throw new Error('SST errors must link to their source item and attempt.');
 const base={attemptId:attempt.id,itemId:question.id,taskType:'summarize-spoken-text' as const,skills:['listening','writing'] as Skill[],createdAt:attempt.createdAt},errors:ErrorRecord[]=[];
 if(analysis.form.formPoints===0)errors.push({...base,id:crypto.randomUUID(),category:'form',token:'response form',expected:'a 50–70 word summary with punctuation and regular sentence structure',actual:`${analysis.form.wordCount} words${analysis.form.zeroFormReason?`; ${analysis.form.zeroFormReason}`:''}`,explanation:analysis.form.zeroFormReason==='too-short'||analysis.form.zeroFormReason==='too-long'?'This response length receives zero Form and zero task credit under the current rule.':'This local structural Form check detected a zero-credit pattern.',severity:3});
 else if(analysis.form.formPoints===1)errors.push({...base,id:crypto.randomUUID(),category:'form',token:'response length',expected:'50–70 words for full Form credit',actual:`${analysis.form.wordCount} words`,explanation:'This response is within a partial Form band; 50–70 words receives full Form credit.',severity:2});
 for(const match of analysis.content.matches.filter(value=>!value.matched))errors.push({...base,id:crypto.randomUUID(),category:'omission',token:match.keyPoint,expected:match.keyPoint,explanation:'Very little key-point evidence was detected for this authored point.',severity:2});
 return errors.slice(0,5);
}
