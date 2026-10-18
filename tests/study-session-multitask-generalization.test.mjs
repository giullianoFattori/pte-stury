import assert from 'node:assert/strict';
import test from 'node:test';
import { KNOWN_TASK_ORDER as tasks, TASK_ID_PREFIXES, taskRecord, taskTypeForItemId } from '../src/domain/pte/taskRegistry.ts';
import { allocateTaskCounts, interleaveTaskSelections } from '../src/domain/study-session/allocation.ts';
import { buildStudySession } from '../src/domain/study-session/builder.ts';
import { createStudySession, recordSessionAttempt, completeStudySession } from '../src/domain/study-session/lifecycle.ts';
import { buildSessionSummary } from '../src/domain/study-session/summary.ts';
const now='2026-10-18T00:00:00.000Z',version='sha256:'+'a'.repeat(64);
const counts=values=>taskRecord((t)=>values[tasks.indexOf(t)]??0);
function build(capacity,n,selected=tasks){
 const candidates=tasks.flatMap(task=>Array.from({length:capacity[task]},(_,i)=>({id:TASK_ID_PREFIXES[task]+'-'+String(i+1).padStart(6,'0'),taskType:task,difficulty:2,prompt:'Synthetic queue metadata only',createdAt:now,revision:1,status:'active',source:'internal',catalogAvailable:true})));
 const before=structuredClone(candidates);const session=buildStudySession({request:{mode:'mixed',taskTypes:[...selected].reverse(),itemCount:n},candidates,sessionId:'nine-task-session',startedAt:now,contentVersion:version,rng:()=>0});assert.deepEqual(candidates,before);return session;
}
for(const size of [4,5,6,7,8,9])for(const n of [2,size,size+4])test(`${size} known tasks / ${n} items balance/interleave uniquely in pure selection core`,()=>{
 const selected=tasks.slice(0,size),capacity=counts(tasks.map(()=>6)),allocation=allocateTaskCounts(n,selected,capacity),session=build(capacity,n,selected);
 assert.equal(session.itemIds.length,n);assert.equal(new Set(session.itemIds).size,n);assert.deepEqual(session.config.taskTypes,selected);
 for(const task of tasks)assert.equal(session.itemIds.filter(id=>taskTypeForItemId(id)===task).length,allocation[task]);
 const expected=interleaveTaskSelections(taskRecord(task=>session.itemIds.filter(id=>taskTypeForItemId(id)===task)));assert.deepEqual(session.itemIds,expected);
 assert.deepEqual(build(capacity,n,selected).itemIds,session.itemIds);assert.ok(Object.isFrozen(session.itemIds));
});
test('nine task remainder allocation is canonical, independent of caller ordering',()=>{assert.deepEqual(tasks.map(t=>allocateTaskCounts(13,[...tasks].reverse(),counts(tasks.map(()=>9)))[t]),[2,2,2,2,1,1,1,1,1]);});
test('uneven and zero capacities redistribute deficits; fail only below requested total',()=>{
 const capacity=counts([0,1,0,3,0,1,8,0,2]);const s=build(capacity,12);assert.equal(s.itemIds.length,12);assert.equal(s.itemIds.some(id=>id.startsWith('wfd-')),false);
 assert.throws(()=>build(capacity,16),e=>e.code==='INSUFFICIENT_CONTENT');assert.equal(build(capacity,15).itemIds.length,15);
});
test('unsupported summary task fails explicitly instead of inferring Read Aloud from a new prefix',()=>{
 let s=createStudySession({id:'future-summary',mode:'task',startedAt:now,taskTypes:['retell-lecture'],itemIds:['rtl-000001'],config:{itemCount:1,taskTypes:['retell-lecture']}});
 const attempt={id:'new-attempt',sessionId:s.id,itemId:'rtl-000001',taskType:'retell-lecture'};s=completeStudySession(recordSessionAttempt(s,attempt,0),now);
 assert.throws(()=>buildSessionSummary(s,[attempt]),e=>e.code==='SESSION_SUMMARY_CORRUPT');
});
