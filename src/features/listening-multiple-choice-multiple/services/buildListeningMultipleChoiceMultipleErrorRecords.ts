import type { Attempt, ErrorRecord, StudyItem } from '../../../domain/pte/types.ts';
import { readTaskData } from '../../../domain/content/taskDataValidation.ts';
import { scoreListeningMultipleChoiceMultiple } from '../../../domain/scoring/listening-multiple-choice-multiple/index.ts';
export function buildListeningMultipleChoiceMultipleErrorRecords(item: StudyItem, attempt: Attempt): ErrorRecord[] {
 if (item.taskType !== 'listening-multiple-choice-multiple' || attempt.taskType !== item.taskType || attempt.itemId !== item.id || attempt.responseData?.kind !== 'multiple-choice') throw new Error('Invalid multiple choice attempt.');
 const data=readTaskData(item,'listening-multiple-choice-multiple'), score=scoreListeningMultipleChoiceMultiple(data.options,attempt.responseData.selectedOptionIds);
 return [...score.missedOptionIds.map(id=>({id,missed:true})),...score.falsePositiveOptionIds.map(id=>({id,missed:false}))].slice(0,4).map(({id,missed})=>{const index=data.options.findIndex(o=>o.id===id),option=data.options[index];return {id:crypto.randomUUID(),attemptId:attempt.id,itemId:item.id,taskType:item.taskType,skills:['listening'],category:missed?'omission':'other',token:option.text,expected:missed?option.text:undefined,actual:missed?undefined:option.text,expectedIndex:index,explanation:missed?'This correct option was not selected.':'This selected option is not supported by the authored answer.',severity:2,createdAt:attempt.createdAt};});
}
