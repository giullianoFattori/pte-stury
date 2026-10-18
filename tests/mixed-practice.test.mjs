import assert from 'node:assert/strict';
import test from 'node:test';
import { setup, snapshot, now } from './helpers/session-persistence.mjs';
import { startMixedPractice } from '../src/features/study-session/services/startMixedPractice.ts';
import { startQuickPractice } from '../src/features/study-session/services/startQuickPractice.ts';
import { startTaskPractice } from '../src/features/study-session/services/startTaskPractice.ts';
import { mixedPracticeCapacity, mixedPracticeCount } from '../src/features/study-session/services/mixedPracticeCapacity.ts';
import { FOUNDATION_TASKS as TASK_ORDER } from '../src/domain/pte/taskRegistry.ts';
import { buildStudySession } from '../src/domain/study-session/builder.ts';
const [wfd,rs,ra]=TASK_ORDER;
const deps=h=>({...h.deps,getContentVersion:async()=> (await h.db.contentState.get('question-bank'))?.contentVersion});
for(const taskTypes of [[wfd,rs],[wfd,ra],[rs,ra],TASK_ORDER])test('Mixed '+taskTypes.join('+')+' builds unique selected-task queue',async t=>{
 const h=await setup(t),itemCount=taskTypes.length===3?10:5,config={taskTypes:[...taskTypes].reverse(),itemCount},before=structuredClone(config);
 const {session,kind}=await startMixedPractice(config,deps(h));assert.equal(kind,'started');assert.equal(session.mode,'mixed');assert.equal(session.itemIds.length,itemCount);assert.equal(new Set(session.itemIds).size,itemCount);assert.deepEqual(session.config.taskTypes,taskTypes);assert.deepEqual(config,before);
 const rows=await h.db.studyItems.bulkGet(session.itemIds);assert.ok(rows.every(i=>taskTypes.includes(i.taskType)));assert.equal(session.contentVersion,h.deps.contentVersion);
 if(taskTypes.length===3){assert.deepEqual(TASK_ORDER.map(t=>rows.filter(i=>i.taskType===t).length),[4,3,3]);assert.deepEqual(rows.map(i=>i.taskType),[wfd,rs,ra,wfd,rs,ra,wfd,rs,ra,wfd]);}
 else for(let i=1;i<rows.length;i++)assert.notEqual(rows[i].taskType,rows[i-1].taskType);
});
test('Max resolves all 17 real bank items, exact capacity and final task purity',async t=>{
 const h=await setup(t),cap=await mixedPracticeCapacity(TASK_ORDER,undefined,h.source);assert.equal(cap.total,17);assert.deepEqual(TASK_ORDER.map(t=>cap.byTask[t]),[5,6,6]);
 const {session}=await startMixedPractice({taskTypes:TASK_ORDER,itemCount:mixedPracticeCount('max',cap.total)},deps(h));assert.equal(session.itemIds.length,17);assert.equal(new Set(session.itemIds).size,17);
});
for(const difficulty of [1,2,3])test('global difficulty '+difficulty+' matches counted capacity and queued items',async t=>{
 const h=await setup(t),cap=await mixedPracticeCapacity(TASK_ORDER,difficulty,h.source);assert.ok(TASK_ORDER.every(t=>cap.byTask[t]>0));const {session}=await startMixedPractice({taskTypes:TASK_ORDER,itemCount:cap.total,difficulty},deps(h));assert.deepEqual(session.config.difficulties,[difficulty]);assert.ok((await h.db.studyItems.bulkGet(session.itemIds)).every(i=>i.difficulty===difficulty));
});
for(const mode of ['quick','task','mixed'])test('active '+mode+' returns Resume without another queue',async t=>{
 const h=await setup(t),d=deps(h);const active=mode==='quick'?await startQuickPractice(d):mode==='task'?await startTaskPractice({taskType:wfd,itemCount:3},d):await startMixedPractice({taskTypes:[wfd,rs],itemCount:5},d),before=await snapshot(h.db);
 const result=await startMixedPractice({taskTypes:TASK_ORDER,itemCount:10},d);assert.equal(result.kind,'resume');assert.equal(result.session.id,active.session.id);assert.deepEqual(await snapshot(h.db),before);
});
test('concurrent Mixed and Task creation resolve to the same one active session',async t=>{
 const h=await setup(t),d=deps(h),results=await Promise.all([startMixedPractice({taskTypes:TASK_ORDER,itemCount:10},d),startTaskPractice({taskType:rs,itemCount:3},d)]);assert.deepEqual(results.map(r=>r.kind).sort(),['resume','started']);assert.equal(results[0].session.id,results[1].session.id);assert.equal(await h.db.studySessions.count(),1);
});
test('selected task with no eligible items blocks product service despite sufficient total',async t=>{
 const h=await setup(t);const rows=await h.source.getByTaskType(ra);await h.db.studyItems.bulkPut(rows.map(row=>({...row,catalogAvailable:false})));const before=await snapshot(h.db);
 await assert.rejects(startMixedPractice({taskTypes:TASK_ORDER,itemCount:5},deps(h)),e=>e.code==='INSUFFICIENT_CONTENT'&&e.details.byTask[ra]===0);assert.deepEqual(await snapshot(h.db),before);
 // Deselecting the empty task remains a valid mixed session.
 assert.equal((await startMixedPractice({taskTypes:[wfd,rs],itemCount:5},deps(h))).kind,'started');
});
for(const input of [null,{},[],{taskTypes:[wfd],itemCount:5},{taskTypes:[wfd,wfd],itemCount:5},{taskTypes:[wfd,'unknown'],itemCount:5},{taskTypes:TASK_ORDER,itemCount:0},{taskTypes:TASK_ORDER,itemCount:501},{taskTypes:TASK_ORDER,itemCount:'5'},{taskTypes:TASK_ORDER,itemCount:2.5},{taskTypes:TASK_ORDER,itemCount:-1},{taskTypes:TASK_ORDER,itemCount:5,difficulty:'2'},{taskTypes:TASK_ORDER,itemCount:5,difficulty:0},{taskTypes:TASK_ORDER,itemCount:5,extra:true}])test('invalid mixed config '+JSON.stringify(input),async t=>{
 const h=await setup(t);await assert.rejects(startMixedPractice(input,deps(h)),e=>e.code==='INVALID_SESSION_CONFIG');assert.equal(await h.db.studySessions.count(),0);
});
test('synthetic redistribution/exact capacity/insufficiency use existing pure builder',()=>{
 const sizes=[1,5,5],prefix=['wfd','rs','ra'];const candidates=TASK_ORDER.flatMap((taskType,t)=>Array.from({length:sizes[t]},(_,i)=>({id:prefix[t]+'-'+String(i+1).padStart(6,'0'),taskType,difficulty:2,prompt:'Synthetic',revision:1,status:'active',source:'internal',catalogAvailable:true,createdAt:now})));
 const build=n=>buildStudySession({request:{mode:'mixed',taskTypes:TASK_ORDER,itemCount:n},candidates,sessionId:'mixed-synthetic',startedAt:now,contentVersion:'sha256:'+'a'.repeat(64),rng:()=>0});
 const session=build(6);assert.deepEqual(TASK_ORDER.map(t=>session.itemIds.filter(id=>candidates.find(c=>c.id===id).taskType===t).length),[1,3,2]);assert.equal(build(11).itemIds.length,11);assert.throws(()=>build(12),e=>e.code==='INSUFFICIENT_CONTENT');
});
test('count defaults/Max respect total and existing 500 limit; count queries stay per selected task',async()=>{
 for(const [cap,expected]of [[17,10],[10,10],[9,5],[5,5],[4,4],[2,2]])assert.equal(mixedPracticeCount('default',cap),expected);
 assert.equal(mixedPracticeCount('max',17),17);assert.equal(mixedPracticeCount(10,9),undefined);assert.equal(mixedPracticeCount(5,4),undefined);assert.equal(mixedPracticeCount('max',501),undefined);assert.equal(mixedPracticeCount('max',500),500);assert.equal(mixedPracticeCount(undefined,17),undefined);assert.equal(mixedPracticeCount('max',0),undefined);
 const queries=[];const source={countPracticeItems:async q=>{queries.push(q);return q.taskTypes[0]===wfd?2:3;}};
 const cap=await mixedPracticeCapacity([ra,wfd],2,source);assert.equal(cap.total,5);assert.equal(cap.byTask[rs],0);assert.deepEqual(queries,[{taskTypes:[wfd],difficulties:[2]},{taskTypes:[ra],difficulties:[2]}]);
});
