import type { Attempt,StudyItem } from '../../../domain/pte/types.ts';
import { readTaskData } from '../../../domain/content/taskDataValidation.ts';
import { scoreHighlightIncorrectWords } from '../../../domain/scoring/highlight-incorrect-words/index.ts';
export function buildHighlightIncorrectWordsAttempt(input:{question:StudyItem;selectedTokenIds:readonly string[];durationMs:number}):Attempt{
 const{question,selectedTokenIds,durationMs}=input;
 if(question.taskType!=='highlight-incorrect-words')throw new Error('Only Highlight Incorrect Words items can be scored by this builder.');
 if(!Number.isFinite(durationMs)||durationMs<0||durationMs>86_400_000)throw new Error('HIW duration must be finite and within a practice day.');
 const data=readTaskData(question,'highlight-incorrect-words'),result=scoreHighlightIncorrectWords(data.displayedTokens,selectedTokenIds);
 const metrics={rawScore:result.rawScore,clampedScore:Math.max(0,result.rawScore),maxScore:result.maxScore,correctSelections:result.correctSelections,incorrectSelections:result.incorrectSelections,missedIncorrectWords:result.missedIncorrectWords,selectedTokenCount:result.selectedTokenIds.length,precision:result.precision,recall:result.recall};
 for(const[key,value]of Object.entries(metrics))if(!Number.isFinite(value)||key!=='rawScore'&&value<0)throw new Error(`Invalid HIW metric: ${key}.`);
 return{id:crypto.randomUUID(),itemId:question.id,taskType:'highlight-incorrect-words',...(question.revision===undefined?{}:{itemRevision:question.revision}),createdAt:new Date().toISOString(),durationMs,score:result.score,metrics,
  responseData:Object.freeze({selectedTokenIds:result.selectedTokenIds,correctTokenIds:result.correctTokenIds,falsePositiveTokenIds:result.falsePositiveTokenIds,missedTokenIds:result.missedTokenIds})};
}
