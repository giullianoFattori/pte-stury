import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSessionSummary, formatSessionDuration } from '../src/domain/study-session/summary.ts';
import { getSessionSummary } from '../src/application/study-session/getSessionSummary.ts';
import { createAttemptsRepository } from '../src/data/repositories/attemptsRepository.ts';
import { setup, now } from './helpers/session-persistence.mjs';
import { exerciseOutcome } from './helpers/exercise-outcome.mjs';
import { persistExerciseOutcome } from '../src/features/study-session/services/persistExerciseOutcome.ts';
const tasks=['write-from-dictation','repeat-sentence','read-aloud'];
function fixture(taskList=tasks) {
 const counts={},items=taskList.map(task=>`${task==='write-from-dictation'?'wfd':task==='repeat-sentence'?'rs':'ra'}-00${counts[task]=(counts[task]??0)+1}`);
 const session={id:'summary-session',mode:'mixed',status:'completed',startedAt:'2026-10-17T10:00:00.000Z',finishedAt:'2026-10-17T10:08:42.000Z',taskTypes:[...new Set(taskList)],itemIds:items,currentIndex:items.length,attemptIds:items.map((_,i)=>`attempt-${i}`),config:{itemCount:items.length,taskTypes:[...new Set(taskList)]}};
 if(session.taskTypes.length===1)session.mode='task';
 const attempts=items.map((id,i)=>({id:session.attemptIds[i],itemId:id,sessionId:session.id,taskType:taskList[i],createdAt:session.startedAt,durationMs:999999,metrics:{correctWords:8,expectedWords:10,totalErrors:2,...(taskList[i]===tasks[0]?{exactMatch:false}:taskList[i]===tasks[1]?{sequenceAccuracyPercent:80,exactContentMatch:false,totalChunks:0,retainedChunks:0}:{textCoveragePercent:80,exactTextMatch:false,speechRatioPercent:60,longPauseCount:2,responseLatencyMs:400})}}));
 return {session,attempts};
}
function summary(f){return buildSessionSummary(f.session,f.attempts);}
function corrupt(f,code='SESSION_SUMMARY_CORRUPT'){assert.throws(()=>summary(f),e=>e.code===code);}
test('mixed grouping, frozen deterministic result, wall clock, no overall score or mutation',()=>{
 const f=fixture([tasks[0],tasks[1],tasks[2],tasks[0],tasks[1]]),before=structuredClone(f),s=summary(f);
 assert.equal(s.questionCount,5);assert.equal(s.completedCount,5);assert.equal(s.durationMs,522000);
 assert.deepEqual(Object.values(s.byTask).map(v=>v.questionCount),[2,2,1]);assert.equal(s.score,undefined);assert.equal(s.overallScore,undefined);
 assert.deepEqual(summary(f),s);assert.deepEqual(f,before);assert.ok(Object.isFrozen(s)&&Object.isFrozen(s.byTask)&&Object.values(s.byTask).every(Object.isFrozen));
});
test('WFD weights by words, not sentence percentage; totals and exact count',()=>{
 const f=fixture([tasks[0],tasks[0]]);Object.assign(f.attempts[0].metrics,{correctWords:2,expectedWords:2,totalErrors:0,exactMatch:true});
 const s=summary(f).byTask[tasks[0]];assert.equal(s.accuracyPercent,10/12*100);assert.equal(s.correctWords,10);assert.equal(s.expectedWords,12);assert.equal(s.totalErrors,2);assert.equal(s.exactCount,1);
});
test('RS word-weighted recall/sequence and analyzed-chunk weighting',()=>{
 const f=fixture([tasks[1],tasks[1],tasks[1]]);
 Object.assign(f.attempts[0].metrics,{correctWords:2,expectedWords:2,sequenceAccuracyPercent:100,retainedChunks:1,totalChunks:2,exactContentMatch:true});
 Object.assign(f.attempts[1].metrics,{retainedChunks:3,totalChunks:3});
 const s=summary(f).byTask[tasks[1]];assert.equal(s.accuracyPercent,18/22*100);assert.ok(Math.abs(s.sequenceAccuracyPercent-((100*2+80*20)/22))<1e-10);assert.equal(s.chunkRetentionPercent,80);assert.equal(s.analyzedChunkResponses,2);assert.equal(s.exactCount,1);assert.equal(s.totalErrors,6);
});
test('RS absent or zero chunk analysis is unavailable, never 0% performance',()=>{
 const f=fixture([tasks[1],tasks[1]]);delete f.attempts[0].metrics.retainedChunks;delete f.attempts[0].metrics.totalChunks;
 assert.equal(summary(f).byTask[tasks[1]].chunkRetentionPercent,undefined);
});
test('RA weighted coverage, exact/error totals, available rate mean, pauses/latency/ratio means',()=>{
 const f=fixture([tasks[2],tasks[2],tasks[2]]);
 Object.assign(f.attempts[0].metrics,{correctWords:2,expectedWords:2,textCoveragePercent:100,exactTextMatch:true,speechRatioPercent:30,longPauseCount:0,responseLatencyMs:100,speechRateWpm:120});
 f.attempts[1].metrics.speechRateWpm=180;
 const s=summary(f).byTask[tasks[2]];assert.equal(s.accuracyPercent,18/22*100);assert.equal(s.speechRatioPercent,50);assert.equal(s.longPauseCount,4/3);assert.equal(s.responseLatencyMs,300);assert.equal(s.speechRateWpm,150);assert.equal(s.speechRateResponses,2);assert.equal(s.exactCount,1);assert.equal(s.totalErrors,6);
 delete f.attempts[0].metrics.speechRateWpm;delete f.attempts[1].metrics.speechRateWpm;assert.equal(summary(f).byTask[tasks[2]].speechRateWpm,undefined);
});
for(const [ms,expected] of [[45000,'45 sec'],[192000,'3 min 12 sec'],[4080000,'1 hr 8 min'],[0,'0 sec']])test(`duration format ${expected}`,()=>assert.equal(formatSessionDuration(ms),expected));
for(const [label,mutate,code] of [
 ['missing attempt',f=>{f.attempts[0]=undefined;},'SESSION_SUMMARY_INCOMPLETE'],
 ['sparse attempts',f=>{delete f.attempts[0];},'SESSION_SUMMARY_INCOMPLETE'],
 ['truncated results',f=>{f.attempts.pop();}],['duplicate ledger',f=>{f.session.attemptIds[1]=f.session.attemptIds[0];}],
 ['wrong attempt order',f=>{f.attempts.reverse();}],['wrong item',f=>{f.attempts[0].itemId='wfd-005';}],
 ['wrong session',f=>{f.attempts[0].sessionId='other';}],['unknown task',f=>{f.attempts[0].taskType='retell-lecture';}],
 ['valid wrong task',f=>{f.attempts[0].taskType='read-aloud';}],['missing metrics',f=>{delete f.attempts[0].metrics;}],
 ['unfinished session',f=>{f.session.currentIndex=2;}],['abandoned',f=>{f.session.status='abandoned';}],
 ['active',f=>{f.session.status='active';delete f.session.finishedAt;}],['missing finish',f=>{delete f.session.finishedAt;}],
 ['invalid timestamp',f=>{f.session.startedAt='not-a-time';}],['negative duration',f=>{f.session.finishedAt='2025-10-17T10:00:00.000Z';}],
 ['excess correct words',f=>{f.attempts[0].metrics.correctWords=11;}],['zero expected words',f=>{f.attempts[0].metrics.expectedWords=0;}],
 ['chunk retained overflow',f=>{f.attempts[1].metrics.retainedChunks=1;}],['missing chunk pair',f=>{delete f.attempts[1].metrics.retainedChunks;}],
 ['nonboolean exact',f=>{f.attempts[0].metrics.exactMatch=1;}],
])test(`integrity rejects ${label}`,()=>{const f=fixture();mutate(f);corrupt(f,code);});
for(const [i,keys] of [[0,['correctWords','expectedWords','totalErrors']],[1,['correctWords','expectedWords','totalErrors','sequenceAccuracyPercent']],[2,['correctWords','expectedWords','totalErrors','textCoveragePercent','speechRatioPercent','longPauseCount','responseLatencyMs']]]) {
 for(const key of keys)for(const bad of [undefined,NaN,Infinity,-1,'2'])test(`rejects ${tasks[i]} ${key}=${bad}`,()=>{const f=fixture();f.attempts[i].metrics[key]=bad;corrupt(f);});
}
for(const [i,key] of [[1,'sequenceAccuracyPercent'],[2,'textCoveragePercent'],[2,'speechRatioPercent']])test(`reject percentage overflow ${key}`,()=>{const f=fixture();f.attempts[i].metrics[key]=101;corrupt(f);});
for(const [i,key] of [[1,'exactContentMatch'],[2,'exactTextMatch']])test(`required boolean ${key}`,()=>{const f=fixture();delete f.attempts[i].metrics[key];corrupt(f);});
test('invalid optional speech rate fails; absent session linkage remains compatible',()=>{
 const f=fixture();f.attempts[2].metrics.speechRateWpm=NaN;corrupt(f);delete f.attempts[2].metrics.speechRateWpm;f.attempts.forEach(a=>delete a.sessionId);assert.equal(summary(f).completedCount,3);
});
test('word/error aggregate overflow rejected',()=>{const f=fixture([tasks[0],tasks[0]]);f.attempts.forEach(a=>a.metrics.expectedWords=Number.MAX_SAFE_INTEGER);corrupt(f);});
test('service requests exact ledger only; no unreferenced standalone result leakage',async()=>{
 const f=fixture();let requested;const s=await getSessionSummary(f.session.id,{sessions:{getById:async()=>f.session},attempts:{getByIds:async ids=>{requested=ids;return f.attempts;}}});assert.deepEqual(requested,f.session.attemptIds);assert.equal(s.completedCount,3);
 await assert.rejects(getSessionSummary('missing',{sessions:{getById:async()=>undefined},attempts:{getByIds:()=>assert.fail()}}),e=>e.code==='SESSION_NOT_FOUND');
 await assert.rejects(getSessionSummary('private',{sessions:{getById:async()=>{throw new Error('/private/db');}},attempts:{getByIds:()=>assert.fail()}}),e=>e.code==='SESSION_SUMMARY_CORRUPT'&&!e.message.includes('/private'));
});
test('real DB bulk order/missing slots; completed all-task outcomes survive catalog removal without writes',async t=>{
 const h=await setup(t);const s=await h.start({mode:'quick'});
 for(let i=0;i<s.itemIds.length;i++){
  const item=await h.source.getById(s.itemIds[i]);await persistExerciseOutcome({...exerciseOutcome(item),item,mode:{kind:'session',sessionId:s.id,expectedIndex:i,expectedItemId:item.id,isFinalItem:i===s.itemIds.length-1},now:()=>now},h.outcomes);
 }
 const attempts=createAttemptsRepository(h.db),saved=await h.sessions.getById(s.id),ids=saved.attemptIds;
 assert.deepEqual((await attempts.getByIds([ids[1],'missing',ids[0]])).map(a=>a?.id),[ids[1],undefined,ids[0]]);
 const before=await h.db.attempts.toArray();await h.db.studyItems.clear();await h.db.contentState.clear();
 const result=await getSessionSummary(s.id,{sessions:h.sessions,attempts});assert.equal(result.completedCount,5);assert.equal(Object.keys(result.byTask).length,3);assert.deepEqual(await h.db.attempts.toArray(),before);
 await h.db.attempts.delete(ids[0]);await assert.rejects(getSessionSummary(s.id,{sessions:h.sessions,attempts}),e=>e.code==='SESSION_SUMMARY_INCOMPLETE');
});
