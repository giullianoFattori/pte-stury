import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSummarizeGroupDiscussionCoverage } from '../src/domain/scoring/summarize-group-discussion.ts';
import { buildSummarizeGroupDiscussionAttempt } from '../src/features/summarize-group-discussion/services/buildSummarizeGroupDiscussionAttempt.ts';
import { buildSummarizeGroupDiscussionErrorRecords } from '../src/features/summarize-group-discussion/services/buildSummarizeGroupDiscussionErrorRecords.ts';
import { buildSummarizeGroupDiscussionReviewItems } from '../src/features/summarize-group-discussion/services/buildSummarizeGroupDiscussionReviewItems.ts';

const data={audio:{path:'/audio/sgd.mp3'},speakers:[{id:'a',label:'Speaker A'},{id:'b',label:'Speaker B'},{id:'c',label:'Speaker C'}],turns:[{speakerId:'a',text:'A'},{speakerId:'b',text:'B'},{speakerId:'c',text:'C'}],keyPoints:['climate models predict regional rainfall changes','urban trees lower street temperatures'],speakerPoints:[{speakerId:'a',points:['scientists update climate models using regional rainfall data']},{speakerId:'b',points:['farmers report local rainfall shortages']},{speakerId:'c',points:['city trees lower street temperature']}],relationships:['the second speaker challenges the first speaker rainfall forecast']};
const question={id:'sgd-000001',taskType:'summarize-group-discussion',revision:7,difficulty:2,prompt:'Summarize',taskData:data};
const fluency={responseLatencyMs:700,speechDurationMs:8000,speechRatio:.8,speechRatioPercent:80,pauseCount:2,longPauseCount:1,averagePauseMs:200,longestPauseMs:600,hasSpeech:true,speechRateWpm:130};
const transcript={text:'Scientists update climate models using regional rainfall data. Farmers report local rainfall shortages. City trees lower street temperature. The second speaker challenges the first speaker rainfall forecast.',processedLocally:true};
function build(overrides={}){const coverage=calculateSummarizeGroupDiscussionCoverage(overrides.text??transcript.text,data);return buildSummarizeGroupDiscussionAttempt({question,transcription:overrides.transcription??transcript,coverage,fluencyMetrics:fluency,durationMs:overrides.durationMs??10000});}
test('Attempt records local key-point coverage score, separate speaker/relationship and fluency metrics',()=>{
 const attempt=build();assert.equal(attempt.taskType,'summarize-group-discussion');assert.equal(attempt.itemRevision,7);assert.equal(attempt.responseText,transcript.text);assert.equal(attempt.score,1);assert.equal(attempt.metrics.keyPointCoverage,1);assert.equal(attempt.metrics.speakerCoverage,1);assert.equal(attempt.metrics.representedSpeakers,3);assert.equal(attempt.metrics.relationshipCoverage,1);assert.equal(attempt.metrics.processedLocally,true);assert.equal(attempt.metrics.speechRatioPercent,80);assert.equal(attempt.metrics.pronunciationScore,undefined);
});
test('Attempt rejects wrong task, remote STT, empty transcript and invalid response bounds',()=>{
 assert.throws(()=>buildSummarizeGroupDiscussionAttempt({question:{...question,taskType:'retell-lecture'},transcription:transcript,coverage:calculateSummarizeGroupDiscussionCoverage(transcript.text,data),fluencyMetrics:fluency,durationMs:10000}));
 for(const transcription of [{...transcript,processedLocally:false},{...transcript,text:'  ' }])assert.throws(()=>build({transcription}));
 for(const durationMs of [0,-1,120001,Infinity])assert.throws(()=>build({durationMs}));
});
test('Errors prioritize missing speakers and cap the list; ReviewItems are further capped',()=>{
 const text='Unrelated words only.',coverage=calculateSummarizeGroupDiscussionCoverage(text,data),attempt=buildSummarizeGroupDiscussionAttempt({question,transcription:{text,processedLocally:true},coverage,fluencyMetrics:fluency,durationMs:1000});
 const errors=buildSummarizeGroupDiscussionErrorRecords(question,attempt,coverage),reviews=buildSummarizeGroupDiscussionReviewItems(attempt,errors);
 assert.ok(errors.length<=6);assert.equal(errors[0].token,'Speaker A');assert.ok(errors.every(error=>error.category==='omission'&&error.explanation.includes('not detected')));assert.ok(reviews.length<=3);assert.ok(reviews.every(review=>review.taskType==='summarize-group-discussion'));
});
