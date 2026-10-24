import type { Attempt, ErrorRecord, Skill, StudyItem } from '../../../domain/pte/types.ts';
import type { SwtAnalysis } from '../../../domain/scoring/summarize-written-text/types.ts';
export function buildSummarizeWrittenTextErrorRecords(question:StudyItem,attempt:Attempt,analysis:SwtAnalysis):ErrorRecord[]{
  if(question.taskType!=='summarize-written-text'||attempt.taskType!=='summarize-written-text'||attempt.itemId!==question.id)throw new Error('SWT errors must link to their source item and attempt.');
  const base={attemptId:attempt.id,itemId:question.id,taskType:'summarize-written-text' as const,skills:['reading','writing'] as Skill[],createdAt:attempt.createdAt};
  const errors:ErrorRecord[]=[];
  if(!analysis.form.withinWordLimit)errors.push({...base,id:crypto.randomUUID(),category:'form',token:'word count',expected:'5–75 words',actual:String(analysis.form.wordCount),explanation:analysis.form.wordCount<5?'Write at least 5 words.':'Keep the response to 75 words or fewer.',severity:3});
  if(!analysis.form.singleSentence)errors.push({...base,id:crypto.randomUUID(),category:'form',token:'sentence form',expected:'one complete sentence',actual:`${analysis.form.sentenceCount} detected`,explanation:'Use one sentence for this response; sentence detection is a local estimate.',severity:3});
  if(analysis.form.allCaps)errors.push({...base,id:crypto.randomUUID(),category:'form',token:'capitalization',expected:'standard sentence capitalization',actual:'all capitals',explanation:'All-capitals responses do not meet the task Form requirement.',severity:3});
  for(const match of analysis.content.matches.filter(value=>!value.matched).slice(0,4))errors.push({...base,id:crypto.randomUUID(),category:'omission',token:match.keyPoint,expected:match.keyPoint,explanation:'Key-point evidence was not detected in the response.',severity:2});
  if(analysis.copy.longestCopiedRunWords>=8||analysis.copy.sourceCopyRatio>=0.3)errors.push({...base,id:crypto.randomUUID(),category:'other',token:'source overlap',expected:'summarize using your own wording',actual:`${analysis.copy.longestCopiedRunWords}-word copied run`,explanation:'A long phrase overlaps the passage; use this as a paraphrasing review prompt, not a vocabulary score.',severity:1});
  return errors.slice(0,6);
}
