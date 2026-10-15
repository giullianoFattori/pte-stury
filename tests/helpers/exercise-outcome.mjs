import { compareWfdAnswer, calculateWfdMetrics } from '../../src/domain/scoring/wfd/index.ts';
import { compareRepeatSentence, calculateRepeatSentenceMetrics, analyseRepeatSentenceChunks } from '../../src/domain/scoring/repeat-sentence/index.ts';
import { compareReadAloud, calculateReadAloudMetrics, calculateReadAloudFluency } from '../../src/domain/scoring/read-aloud/index.ts';
import { buildWfdAttempt } from '../../src/features/write-from-dictation/services/buildWfdAttempt.ts';
import { buildWfdErrorRecords } from '../../src/features/write-from-dictation/services/buildWfdErrorRecords.ts';
import { buildWfdReviewItems } from '../../src/features/write-from-dictation/services/buildWfdReviewItems.ts';
import { buildRepeatSentenceAttempt } from '../../src/features/repeat-sentence/services/buildRepeatSentenceAttempt.ts';
import { buildRepeatSentenceErrorRecords } from '../../src/features/repeat-sentence/services/buildRepeatSentenceErrorRecords.ts';
import { buildRepeatSentenceReviewItems } from '../../src/features/repeat-sentence/services/buildRepeatSentenceReviewItems.ts';
import { buildReadAloudAttempt } from '../../src/features/read-aloud/services/buildReadAloudAttempt.ts';
import { buildReadAloudErrorRecords } from '../../src/features/read-aloud/services/buildReadAloudErrorRecords.ts';
import { buildReadAloudReviewItems } from '../../src/features/read-aloud/services/buildReadAloudReviewItems.ts';
export function exerciseOutcome(question) {
 const text=question.answer.split(' ').slice(1).join(' ');
 const transcription={text,processedLocally:true,engine:'whisper.cpp',model:'base.en',language:'en'};
 let comparison,attempt,errors,reviews;
 if(question.taskType==='write-from-dictation') {
  comparison=compareWfdAnswer(question.answer,text);
  attempt=buildWfdAttempt({question,answer:text,comparison,score:calculateWfdMetrics(comparison),durationMs:3000});
  errors=buildWfdErrorRecords(attempt,comparison);reviews=buildWfdReviewItems({question,attempt,errors});
 }else if(question.taskType==='repeat-sentence'){
  comparison=compareRepeatSentence(question.answer,text);
  attempt=buildRepeatSentenceAttempt({question,transcription,comparison,score:calculateRepeatSentenceMetrics(comparison),chunkAnalysis:analyseRepeatSentenceChunks(comparison,question.chunks),durationMs:3000});
  errors=buildRepeatSentenceErrorRecords(attempt,comparison);reviews=buildRepeatSentenceReviewItems({question,attempt,errors});
 }else{
  comparison=compareReadAloud(question.answer,text);
  const segment=(startMs,endMs)=>({startMs,endMs,durationMs:endMs-startMs});
  const segmentation={durationMs:3000,frames:[],noiseFloorDb:-50,thresholdDb:-38,speechSegments:[segment(500,2500)],pauseSegments:[segment(0,500),segment(2500,3000)]};
  attempt=buildReadAloudAttempt({question,transcription,comparison,contentMetrics:calculateReadAloudMetrics(comparison),fluencyMetrics:calculateReadAloudFluency(segmentation,comparison.actualWordCount),longPauseThresholdMs:500,durationMs:3000});
  errors=buildReadAloudErrorRecords(attempt,comparison);reviews=buildReadAloudReviewItems({question,attempt,errors});
 }
 return {attempt,errors,reviews};
}
