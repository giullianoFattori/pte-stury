import type { Attempt,StudyItem } from '../../../domain/pte/types.ts';
import { countWords } from '../../../domain/scoring/shared/writing/wordCount.ts';
import type { SstAnalysis } from '../../../domain/scoring/summarize-spoken-text/types.ts';
import { SST_TIMING } from './summarizeSpokenTextTimer.ts';
export function buildSummarizeSpokenTextAttempt(input:{question:StudyItem;response:string;analysis:SstAnalysis;durationMs:number;sourcePlaybackStarted:boolean}):Attempt{
 const{question,response,analysis,durationMs,sourcePlaybackStarted}=input;
 if(question.taskType!=='summarize-spoken-text'||sourcePlaybackStarted!==true)throw new Error('An SST attempt requires its own source playback.');
 if(typeof response!=='string'||!analysis||!Number.isFinite(durationMs)||durationMs<0||durationMs>SST_TIMING.taskMs)throw new Error('A response, complete local analysis and valid task duration are required.');
 const{form,content}=analysis;
 const expectedTarget=form.wordCount>=50&&form.wordCount<=70;
 const expectedPartial=(form.wordCount>=40&&form.wordCount<50)||(form.wordCount>70&&form.wordCount<=100);
 const expectedZero=form.wordCount<40||form.wordCount>100;
 const structuralZero=form.allCaps||!form.hasPunctuation||form.bulletLike||form.veryShortSentencePattern;
 const expectedPoints:0|1|2=expectedZero||structuralZero?0:expectedTarget?2:expectedPartial?1:0;
 if(form.wordCount!==countWords(response)||content.responseWordCount!==form.wordCount||content.totalKeyPoints<1||content.matchedKeyPoints>content.totalKeyPoints
  ||Math.abs(content.keyPointCoverage-content.matchedKeyPoints/content.totalKeyPoints)>1e-8||Math.abs(content.keyPointCoveragePercent-content.keyPointCoverage*100)>1e-8
  ||form.formCredit!==form.formPoints/2||form.targetRange!==expectedTarget||form.partialRange!==expectedPartial||form.zeroRange!==expectedZero||form.formPoints!==expectedPoints)
  throw new Error('Summarize Spoken Text analysis is inconsistent.');
 const metrics:NonNullable<Attempt['metrics']>={sourcePlaybackStarted:true,wordCount:form.wordCount,formPoints:form.formPoints,formCredit:form.formCredit,targetRange:form.targetRange,partialRange:form.partialRange,zeroRange:form.zeroRange,
  allCaps:form.allCaps,hasPunctuation:form.hasPunctuation,bulletLike:form.bulletLike,veryShortSentencePattern:form.veryShortSentencePattern,sentenceCount:form.sentenceCount,
  startsWithCapital:form.startsWithCapital,endsWithTerminalPunctuation:form.endsWithTerminalPunctuation,duplicatePunctuation:form.duplicatePunctuation,
  keyPointCoverage:content.keyPointCoverage,keyPointCoveragePercent:content.keyPointCoveragePercent,matchedKeyPoints:content.matchedKeyPoints,totalKeyPoints:content.totalKeyPoints};
 for(const[key,value]of Object.entries(metrics))if(typeof value==='number'&&(!Number.isFinite(value)||value<0||(key.endsWith('Percent')&&value>100)||(['keyPointCoverage','formCredit'].includes(key)&&value>1)))throw new Error(`Invalid Summarize Spoken Text metric: ${key}.`);
 return{id:crypto.randomUUID(),itemId:question.id,taskType:'summarize-spoken-text',...(question.revision===undefined?{}:{itemRevision:question.revision}),createdAt:new Date().toISOString(),responseText:response,durationMs,score:content.keyPointCoverage*form.formCredit,metrics};
}
