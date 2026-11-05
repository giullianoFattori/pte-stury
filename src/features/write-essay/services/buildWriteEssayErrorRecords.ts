import type { Attempt, ErrorRecord, Skill, StudyItem } from '../../../domain/pte/types.ts';
import type { WriteEssayAnalysis } from '../../../domain/scoring/write-essay/types.ts';
export function buildWriteEssayErrorRecords(question:StudyItem,attempt:Attempt,analysis:WriteEssayAnalysis):ErrorRecord[]{
 if(question.taskType!=='write-essay'||attempt.taskType!=='write-essay'||attempt.itemId!==question.id)throw new Error('Write Essay errors must link to their source item and attempt.');
 const base={attemptId:attempt.id,itemId:question.id,taskType:'write-essay' as const,skills:['writing'] as Skill[],createdAt:attempt.createdAt},errors:ErrorRecord[]=[];
 if(analysis.form.formPoints===0)errors.push({...base,id:crypto.randomUUID(),category:'form',token:'essay form',expected:'120–380 words, with full Form at 200–300 words',actual:`${analysis.form.wordCount} words`,explanation:'The local Form checks assign zero Form credit to this response.',severity:3});
 for(const match of analysis.requirements.matches.filter(value=>!value.matched).slice(0,4))errors.push({...base,id:crypto.randomUUID(),category:'omission',token:match.keyPoint,expected:match.keyPoint,explanation:'Prompt-requirement evidence was not detected in the response.',severity:2});
 return errors.slice(0,5);
}
