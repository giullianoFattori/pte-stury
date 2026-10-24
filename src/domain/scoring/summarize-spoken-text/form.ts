import { countWords,writingTokens } from '../shared/writing/wordCount.ts';
import { countDetectedSentences,endsWithTerminalPunctuation,hasDuplicatePunctuation,isAllCaps,splitDetectedSentences,startsWithCapital } from '../shared/writing/sentenceBoundaries.ts';
import type { SstFormResult,SstZeroFormReason } from './types.ts';
export const SST_FORM_CONFIG=Object.freeze({targetMinimum:50,targetMaximum:70,partialMinimum:40,partialMaximum:100,veryShortSentenceMaximumWords:5,veryShortSentenceMinimumCount:3});
function hasOnlyBulletLines(value:string):boolean{
 const lines=value.split(/\r?\n/u).map(line=>line.trim()).filter(Boolean);
 return lines.length>0&&lines.every(line=>/^(?:[-*•]|\d+[.)])\s+\S/u.test(line));
}
/** Pearson Form band approximated with transparent local structural zero checks. */
export function validateSstForm(response:string):SstFormResult{
 const wordCount=countWords(response),allCaps=isAllCaps(response),hasPunctuation=/[.,!?;:]/u.test(response),bulletLike=hasOnlyBulletLines(response),sentences=splitDetectedSentences(response);
 const sentenceCount=countDetectedSentences(response),veryShortSentencePattern=sentenceCount>=SST_FORM_CONFIG.veryShortSentenceMinimumCount&&sentences.every(sentence=>writingTokens(sentence).length<=SST_FORM_CONFIG.veryShortSentenceMaximumWords);
 const targetRange=wordCount>=SST_FORM_CONFIG.targetMinimum&&wordCount<=SST_FORM_CONFIG.targetMaximum;
 const partialRange=(wordCount>=SST_FORM_CONFIG.partialMinimum&&wordCount<SST_FORM_CONFIG.targetMinimum)||(wordCount>SST_FORM_CONFIG.targetMaximum&&wordCount<=SST_FORM_CONFIG.partialMaximum);
 const zeroRange=wordCount<SST_FORM_CONFIG.partialMinimum||wordCount>SST_FORM_CONFIG.partialMaximum;
 let zeroFormReason:SstZeroFormReason|undefined;
 if(wordCount<SST_FORM_CONFIG.partialMinimum)zeroFormReason='too-short';
 else if(wordCount>SST_FORM_CONFIG.partialMaximum)zeroFormReason='too-long';
 else if(allCaps)zeroFormReason='all-caps';
 else if(!hasPunctuation)zeroFormReason='no-punctuation';
 else if(bulletLike)zeroFormReason='bullet-like';
 else if(veryShortSentencePattern)zeroFormReason='very-short-sentences';
 const formPoints:0|1|2=zeroFormReason?0:targetRange?2:partialRange?1:0;
 return Object.freeze({wordCount,formPoints,formCredit:formPoints/2 as SstFormResult['formCredit'],targetRange,partialRange,zeroRange,allCaps,hasPunctuation,bulletLike,veryShortSentencePattern,...(zeroFormReason?{zeroFormReason}:{}),sentenceCount,startsWithCapital:startsWithCapital(response),endsWithTerminalPunctuation:endsWithTerminalPunctuation(response),duplicatePunctuation:hasDuplicatePunctuation(response)});
}
