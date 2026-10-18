import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateRetellLectureCoverage } from '../src/domain/scoring/retell-lecture.ts';
import { buildRetellLectureAttempt } from '../src/features/retell-lecture/services/buildRetellLectureAttempt.ts';
import { buildRetellLectureErrorRecords } from '../src/features/retell-lecture/services/buildRetellLectureErrorRecords.ts';
import { buildRetellLectureReviewItems } from '../src/features/retell-lecture/services/buildRetellLectureReviewItems.ts';
const question={id:'rtl-000003',taskType:'retell-lecture',revision:4,createdAt:'2026-10-18T00:00:00.000Z',difficulty:2,prompt:'Retell',taskData:{keyPoints:['Trees reduce temperatures','Shade protects pedestrians']}};
const transcription={text:'Trees reduce temperatures and shade protects pedestrians',processedLocally:true,confidence:.8};
const fluency={recordingDurationMs:4000,responseLatencyMs:300,speechDurationMs:3000,interiorPauseDurationMs:200,speechRatio:.75,speechRatioPercent:75,pauseCount:2,longPauseCount:1,averagePauseMs:100,longestPauseMs:600,hasSpeech:true,speechRateWpm:120,endingSilenceMs:0,activeWindowMs:4000};
function make(overrides={}) { const cov=calculateRetellLectureCoverage(transcription.text,question.taskData);return buildRetellLectureAttempt({question,transcription,coverage:cov,fluencyMetrics:fluency,durationMs:4000,...overrides}); }
test('Attempt persists local transcript, exact internal coverage score, revision and diagnostics',()=>{
 const attempt=make();assert.equal(attempt.taskType,'retell-lecture');assert.equal(attempt.itemRevision,4);assert.equal(attempt.responseText,transcription.text);assert.equal(attempt.durationMs,4000);assert.equal(attempt.score,1);assert.equal(attempt.metrics.keyPointCoverage,1);assert.equal(attempt.metrics.processedLocally,true);assert.equal(attempt.metrics.speechRateWpm,120);assert.equal(attempt.metrics.pronunciationScore,undefined);
});
test('only valid local Retell Lecture response and bounded finite metrics can be saved',()=>{
 assert.throws(()=>make({question:{...question,taskType:'read-aloud'}}));assert.throws(()=>make({transcription:{...transcription,processedLocally:false}}));assert.throws(()=>make({transcription:{...transcription,text:'...'}}));assert.throws(()=>make({durationMs:0}));assert.throws(()=>make({durationMs:40001}));
 assert.throws(()=>make({fluencyMetrics:{...fluency,longestPauseMs:Infinity}}));
});
test('only missed authored key points become omission errors, with no more than three review prompts',()=>{
 const points=['Trees reduce temperatures','Shade protects pedestrians','Cooling saves energy','Cities become comfortable','Energy use declines'];
 const item={...question,taskData:{keyPoints:points}};const cov=calculateRetellLectureCoverage('Trees reduce temperatures',item.taskData);const attempt=buildRetellLectureAttempt({question:item,transcription,coverage:cov,fluencyMetrics:fluency,durationMs:4000});
 const errors=buildRetellLectureErrorRecords(item,attempt,cov),reviews=buildRetellLectureReviewItems(attempt,errors);
 assert.equal(errors.length,4);assert.ok(errors.every(e=>e.category==='omission'&&e.explanation==='This key point was not detected in the transcribed response.'));
 assert.equal(reviews.length,3);assert.ok(reviews.every(r=>r.type==='phrase'&&r.sourceAttemptId===attempt.id));
});
