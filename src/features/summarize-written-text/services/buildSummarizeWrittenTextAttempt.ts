import type { Attempt, StudyItem } from '../../../domain/pte/types.ts';
import type { SwtAnalysis } from '../../../domain/scoring/summarize-written-text/types.ts';
import { countWords } from '../../../domain/scoring/shared/writing/wordCount.ts';
export function buildSummarizeWrittenTextAttempt(input:{question:StudyItem;response:string;analysis:SwtAnalysis;durationMs:number}):Attempt {
  const {question,response,analysis,durationMs}=input;
  if(question.taskType!=='summarize-written-text')throw new Error('Only Summarize Written Text items can be saved.');
  if(typeof response!=='string'||!analysis||!Number.isFinite(durationMs)||durationMs<0||durationMs>600_000)throw new Error('A response, complete local analysis and valid task duration are required.');
  if(analysis.form.wordCount!==countWords(response)||analysis.content.responseWordCount!==analysis.form.wordCount||analysis.content.totalKeyPoints<1
    ||analysis.content.matchedKeyPoints>analysis.content.totalKeyPoints||Math.abs(analysis.content.keyPointCoverage-analysis.content.matchedKeyPoints/analysis.content.totalKeyPoints)>1e-8
    ||analysis.form.formValid!==(analysis.form.withinWordLimit&&analysis.form.singleSentence&&!analysis.form.allCaps)
    ||analysis.copy.sourceCopyRatio<0||analysis.copy.sourceCopyRatio>1||analysis.passageWordCount<1||analysis.compressionRatio<0)
    throw new Error('Summarize Written Text analysis is inconsistent.');
  const metrics:NonNullable<Attempt['metrics']>={formValid:analysis.form.formValid,wordCount:analysis.form.wordCount,withinWordLimit:analysis.form.withinWordLimit,
    singleSentence:analysis.form.singleSentence,sentenceCount:analysis.form.sentenceCount,allCaps:analysis.form.allCaps,startsWithCapital:analysis.form.startsWithCapital,
    endsWithTerminalPunctuation:analysis.form.endsWithTerminalPunctuation,duplicatePunctuation:analysis.form.duplicatePunctuation,
    keyPointCoverage:analysis.content.keyPointCoverage,keyPointCoveragePercent:analysis.content.keyPointCoveragePercent,
    matchedKeyPoints:analysis.content.matchedKeyPoints,totalKeyPoints:analysis.content.totalKeyPoints,
    sourceCopyRatio:analysis.copy.sourceCopyRatio,sourceCopyPercent:analysis.copy.sourceCopyPercent,longestCopiedRunWords:analysis.copy.longestCopiedRunWords,
    passageWordCount:analysis.passageWordCount,compressionRatio:analysis.compressionRatio};
  for(const [key,value]of Object.entries(metrics))if(typeof value==='number'&&(!Number.isFinite(value)||value<0||(key.endsWith('Percent')&&value>100)||(['keyPointCoverage','sourceCopyRatio'].includes(key)&&value>1)))throw new Error(`Invalid Summarize Written Text metric: ${key}.`);
  return{id:crypto.randomUUID(),itemId:question.id,taskType:'summarize-written-text',...(question.revision===undefined?{}:{itemRevision:question.revision}),createdAt:new Date().toISOString(),responseText:response,durationMs,score:analysis.form.formValid?analysis.content.keyPointCoverage:0,metrics};
}
