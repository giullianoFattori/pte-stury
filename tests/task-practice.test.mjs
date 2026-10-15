import assert from 'node:assert/strict';
import test from 'node:test';
import { setup, snapshot } from './helpers/session-persistence.mjs';
import { startTaskPractice } from '../src/features/study-session/services/startTaskPractice.ts';
import { startQuickPractice } from '../src/features/study-session/services/startQuickPractice.ts';
import { taskPracticeQuery, taskPracticeCount } from '../src/features/study-session/services/taskPracticeCapacity.ts';
const deps=h=>({...h.deps,getContentVersion:async()=> (await h.db.contentState.get('question-bank'))?.contentVersion});
for(const [taskType,itemCount] of [['write-from-dictation',3],['write-from-dictation',5],['repeat-sentence',6],['read-aloud',6]])test(`${taskType} ${itemCount} creates a pure unique Task queue`,async t=>{
 const h=await setup(t),result=await startTaskPractice({taskType,itemCount},deps(h));assert.equal(result.kind,'started');const {session}=result;
 assert.equal(session.mode,'task');assert.deepEqual(session.taskTypes,[taskType]);assert.equal(session.itemIds.length,itemCount);assert.equal(new Set(session.itemIds).size,itemCount);assert.equal(session.contentVersion,h.deps.contentVersion);
 for(const id of session.itemIds)assert.equal((await h.source.getById(id)).taskType,taskType);
});
test('WFD 6 rejects without reducing count, creating rows or changing history',async t=>{
 const h=await setup(t),before=await snapshot(h.db);await assert.rejects(startTaskPractice({taskType:'write-from-dictation',itemCount:6},deps(h)),e=>e.code==='INSUFFICIENT_CONTENT');assert.deepEqual(await snapshot(h.db),before);
});
for(const difficulty of [1,2,3])test('difficulty '+difficulty+' count/query and selection agree',async t=>{
 const h=await setup(t),taskType='write-from-dictation',query=taskPracticeQuery(taskType,difficulty),rows=await h.source.queryPracticeItems(query),capacity=await h.source.countPracticeItems(query);
 assert.equal(rows.length,capacity);assert.ok(capacity>0);const {session}=await startTaskPractice({taskType,itemCount:capacity,difficulty},deps(h));assert.deepEqual(session.config.difficulties,[difficulty]);
 for(const id of session.itemIds)assert.equal((await h.source.getById(id)).difficulty,difficulty);
});
test('Any capacity uses all matching practice content and never infers difficulty',async t=>{
 const h=await setup(t);assert.deepEqual(taskPracticeQuery('repeat-sentence'),{taskTypes:['repeat-sentence']});assert.equal(await h.source.countPracticeItems(taskPracticeQuery('repeat-sentence')),6);
 const {session}=await startTaskPractice({taskType:'repeat-sentence',itemCount:3},deps(h));assert.equal(session.config.difficulties,undefined);
});
for(const mode of ['quick','task'])test('active '+mode+' returns Resume without a new queue',async t=>{
 const h=await setup(t),active=mode==='quick'?await startQuickPractice(deps(h)):await startTaskPractice({taskType:'read-aloud',itemCount:3},deps(h));const before=await snapshot(h.db);
 const result=await startTaskPractice({taskType:'write-from-dictation',itemCount:3},deps(h));assert.equal(result.kind,'resume');assert.equal(result.session.id,active.session.id);assert.deepEqual(await snapshot(h.db),before);
});
test('Quick/Task concurrent creation race returns one started and one resumable identity',async t=>{
 const h=await setup(t),d=deps(h);const results=await Promise.all([startQuickPractice(d),startTaskPractice({taskType:'repeat-sentence',itemCount:3},d)]);
 assert.deepEqual(results.map(r=>r.kind).sort(),['resume','started']);assert.equal(results[0].session.id,results[1].session.id);assert.equal(await h.db.studySessions.count(),1);
});
test('capacity changes cause insufficiency, never shrink or cross-task fill',async t=>{
 const h=await setup(t),taskType='write-from-dictation';assert.equal(await h.source.countPracticeItems(taskPracticeQuery(taskType)),5);
 const rows=await h.source.getByTaskType(taskType);await h.db.studyItems.bulkPut(rows.slice(0,3).map(row=>({...row,catalogAvailable:false})));
 await assert.rejects(startTaskPractice({taskType,itemCount:5},deps(h)),e=>e.code==='INSUFFICIENT_CONTENT');assert.equal(await h.db.studySessions.count(),0);assert.equal(await h.source.countPracticeItems(taskPracticeQuery(taskType)),2);
});
test('zero capacity rejects and installed identity is required',async t=>{
 const h=await setup(t);assert.equal(await h.source.countPracticeItems(taskPracticeQuery('write-from-dictation',5)),0);
 await assert.rejects(startTaskPractice({taskType:'write-from-dictation',itemCount:1,difficulty:5},deps(h)),e=>e.code==='INSUFFICIENT_CONTENT');
 await assert.rejects(startTaskPractice({taskType:'read-aloud',itemCount:3},{...deps(h),getContentVersion:async()=>undefined}),e=>e.code==='SESSION_STORAGE_CORRUPT');
});
for(const input of [null,[],{}, {taskType:'unknown',itemCount:3},{taskType:'read-aloud',itemCount:0},{taskType:'read-aloud',itemCount:'3'}, {taskType:'read-aloud',itemCount:501},{taskType:'read-aloud',itemCount:2.5},{taskType:'read-aloud',itemCount:3,difficulty:'2'},{taskType:'read-aloud',itemCount:3,difficulty:0},{taskType:['read-aloud','repeat-sentence'],itemCount:3},{taskType:'read-aloud',itemCount:3,extra:true}])test('invalid Task request rejects '+JSON.stringify(input),async t=>{
 const h=await setup(t);await assert.rejects(startTaskPractice(input,deps(h)),e=>e.code==='INVALID_SESSION_CONFIG');assert.equal(await h.db.studySessions.count(),0);
});
test('UI default/count/Max policy uses capacity and respects domain maximum',()=>{
 assert.equal(taskPracticeCount('default',6),5);assert.equal(taskPracticeCount('default',2),2);assert.equal(taskPracticeCount(3,2),undefined);assert.equal(taskPracticeCount(5,2),undefined);assert.equal(taskPracticeCount('max',6),6);assert.equal(taskPracticeCount('max',2),2);
 for(const capacity of [0,-1,NaN,Infinity,1.5])assert.equal(taskPracticeCount('max',capacity),undefined);
 assert.equal(taskPracticeCount('max',501),undefined);assert.equal(taskPracticeCount('max',500),500);assert.equal(taskPracticeCount(undefined,4),undefined);
});
