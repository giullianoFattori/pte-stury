import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSessionSummary, SESSION_SUMMARY_TASKS } from '../src/domain/study-session/summary.ts';
const session={id:'rtl-summary',mode:'task',status:'completed',startedAt:'2026-10-18T00:00:00.000Z',finishedAt:'2026-10-18T00:02:00.000Z',taskTypes:['retell-lecture'],itemIds:['rtl-000003','rtl-000004'],currentIndex:2,attemptIds:['a1','a2'],config:{itemCount:2,taskTypes:['retell-lecture']}};
const base={keyPointCoverage:.5,keyPointCoveragePercent:50,matchedKeyPoints:2,totalKeyPoints:4,speechRatioPercent:70,longPauseCount:1,responseLatencyMs:300,speechRateWpm:120};
const attempts=[base,{...base,keyPointCoverage:1,keyPointCoveragePercent:100,matchedKeyPoints:3,totalKeyPoints:3,speechRatioPercent:90,longPauseCount:0,responseLatencyMs:500}].map((metrics,i)=>({id:`a${i+1}`,itemId:session.itemIds[i],taskType:'retell-lecture',sessionId:session.id,metrics}));
test('Retell Lecture summary aggregates coverage, key-point counts and local fluency diagnostics',()=>{
 const result=buildSessionSummary(session,attempts),summary=result.byTask['retell-lecture'];
 assert.deepEqual(SESSION_SUMMARY_TASKS,['write-from-dictation','repeat-sentence','read-aloud','retell-lecture','summarize-group-discussion','describe-image']);
 assert.equal(summary.questionCount,2);assert.equal(summary.averageKeyPointCoveragePercent,75);assert.equal(summary.matchedKeyPoints,5);assert.equal(summary.totalKeyPoints,7);assert.equal(summary.averageSpeechRatioPercent,80);assert.equal(summary.averageLongPauseCount,.5);assert.equal(summary.averageResponseLatencyMs,400);assert.equal(summary.averageSpeechRateWpm,120);assert.equal(summary.speechRateResponses,2);assert.equal('score' in summary,false);
});
test('summary rejects inconsistent coverage and keeps optional speech rate unavailable',()=>{
 const bad=structuredClone(attempts);bad[0].metrics.keyPointCoverage=.75;assert.throws(()=>buildSessionSummary(session,bad),e=>e.code==='SESSION_SUMMARY_CORRUPT');
 const rows=structuredClone(attempts);delete rows[0].metrics.speechRateWpm;delete rows[1].metrics.speechRateWpm;assert.equal(buildSessionSummary(session,rows).byTask['retell-lecture'].averageSpeechRateWpm,undefined);
});
