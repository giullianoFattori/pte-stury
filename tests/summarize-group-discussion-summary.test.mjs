import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSessionSummary, SESSION_SUMMARY_TASKS } from '../src/domain/study-session/summary.ts';

const session={id:'sgd-summary',mode:'task',status:'completed',startedAt:'2026-10-18T00:00:00.000Z',finishedAt:'2026-10-18T00:04:00.000Z',taskTypes:['summarize-group-discussion'],itemIds:['sgd-000001','sgd-000002'],currentIndex:2,attemptIds:['a1','a2'],config:{itemCount:2,taskTypes:['summarize-group-discussion']}};
const first={processedLocally:true,keyPointCoverage:.5,keyPointCoveragePercent:50,matchedKeyPoints:2,totalKeyPoints:4,speakerCoverage:2/3,speakerCoveragePercent:200/3,representedSpeakers:2,totalSpeakers:3,relationshipCoverage:.5,relationshipCoveragePercent:50,matchedRelationships:1,totalRelationships:2,speechRatioPercent:70,longPauseCount:1,responseLatencyMs:300,speechRateWpm:120};
const second={processedLocally:true,keyPointCoverage:1,keyPointCoveragePercent:100,matchedKeyPoints:3,totalKeyPoints:3,speakerCoverage:1,speakerCoveragePercent:100,representedSpeakers:3,totalSpeakers:3,speechRatioPercent:90,longPauseCount:0,responseLatencyMs:500};
const attempts=[first,second].map((metrics,index)=>({id:`a${index+1}`,itemId:session.itemIds[index],taskType:'summarize-group-discussion',sessionId:session.id,metrics}));
test('SGD summary aggregates key points, speaker coverage, optional relationships and local fluency',()=>{
 const result=buildSessionSummary(session,attempts),task=result.byTask['summarize-group-discussion'];
 assert.ok(SESSION_SUMMARY_TASKS.includes('summarize-group-discussion'));assert.equal(task.questionCount,2);
 assert.equal(task.averageKeyPointCoveragePercent,75);assert.equal(task.matchedKeyPoints,5);assert.equal(task.totalKeyPoints,7);
 assert.ok(Math.abs(task.averageSpeakerCoveragePercent-250/3)<1e-10);assert.equal(task.representedSpeakers,5);assert.equal(task.totalSpeakerSlots,6);
 assert.equal(task.averageRelationshipCoveragePercent,50);assert.equal(task.matchedRelationships,1);assert.equal(task.totalRelationships,2);
 assert.equal(task.averageSpeechRatioPercent,80);assert.equal(task.averageLongPauseCount,.5);assert.equal(task.averageResponseLatencyMs,400);assert.equal(task.averageSpeechRateWpm,120);assert.equal(task.speechRateResponses,1);assert.equal('score' in task,false);
});
test('summary rejects inconsistent key-point, speaker and relationship coverage; absent relationship metrics remain omitted',()=>{
 for(const [key,value] of [['keyPointCoverage',.75],['speakerCoverage',1],['relationshipCoverage',1]]){const rows=structuredClone(attempts);rows[0].metrics[key]=value;assert.throws(()=>buildSessionSummary(session,rows),e=>e.code==='SESSION_SUMMARY_CORRUPT');}
 const rows=structuredClone(attempts);for(const key of ['relationshipCoverage','relationshipCoveragePercent','matchedRelationships','totalRelationships'])delete rows[0].metrics[key];
 const task=buildSessionSummary(session,rows).byTask['summarize-group-discussion'];assert.equal(task.averageRelationshipCoveragePercent,undefined);assert.equal(task.matchedRelationships,undefined);
});
