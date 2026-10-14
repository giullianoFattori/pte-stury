import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { TASK_ORDER } from '../src/domain/content/canonical.ts';
import { installItem } from '../src/domain/content/installedContent.ts';
import { sampleStudyItems } from '../src/domain/content/sampling.ts';
import { buildStudySession, validateBuildRequest } from '../src/domain/study-session/builder.ts';
import { allocateTaskCounts, interleaveTaskSelections } from '../src/domain/study-session/allocation.ts';
import { StudySessionError } from '../src/domain/study-session/errors.ts';
import { parseStudySession, recordSessionAttempt, completeStudySession } from '../src/domain/study-session/lifecycle.ts';
import { prepareStudySession } from '../src/application/study-session/prepareStudySession.ts';
import { generatedQuestionBank } from '../src/data/question-bank/generatedQuestionBank.ts';
import { createStudyItemsRepository } from '../src/data/repositories/studyItemsRepository.ts';
import { database, snapshot } from './helpers/content-db.mjs';
import { bootstrapApp } from '../src/app/bootstrap.ts';
const version=generatedQuestionBank().manifest.contentVersion,now='2026-10-14T01:00:00.000Z';
const real=generatedQuestionBank().bundle.items.map(item=>installItem(item,now));
const [wfd,rs,ra]=TASK_ORDER;
const capacity=(a,b,c)=>({[wfd]:a,[rs]:b,[ra]:c});
const counts=session=>Object.fromEntries(TASK_ORDER.map(task=>[task,session.itemIds.filter(id=>id.startsWith({[wfd]:'wfd',[rs]:'rs',[ra]:'ra'}[task]+'-')).length]));
const taskSequence=session=>session.itemIds.map(id=>id.split('-')[0]);
const build=(request,candidates=real,rng=()=>0)=>buildStudySession({request,candidates,sessionId:'session-fixed',startedAt:now,contentVersion:version,rng});
const mixed=(count=10)=>({mode:'mixed',itemCount:count,taskTypes:[ra,wfd,rs]});
const candidates=(sizes)=>TASK_ORDER.flatMap((task,t)=>Array.from({length:sizes[t]},(_,i)=>({id:['wfd','rs','ra'][t]+'-'+String(i+1).padStart(6,'0'),taskType:task,difficulty:i%5+1,prompt:'Synthetic candidate',revision:1,status:'active',source:'internal',catalogAvailable:true,createdAt:now})));
function error(fn,code){assert.throws(fn,e=>e instanceof StudySessionError&&e.code===code);}
test('current canonical catalog: Quick 5 balances 2/2/1 and interleaves canonically',()=>{
 const session=build({mode:'quick'});assert.equal(session.itemIds.length,5);assert.deepEqual(counts(session),capacity(2,2,1));assert.deepEqual(taskSequence(session),['wfd','rs','ra','wfd','rs']);
 assert.deepEqual(session.taskTypes,TASK_ORDER);assert.equal(session.contentVersion,version);assert.equal(session.currentIndex,0);assert.deepEqual(session.attemptIds,[]);assert.ok(Object.isFrozen(session.itemIds));
 assert.deepEqual(build({mode:'quick',itemCount:5}),session);
});
test('current bank: Task WFD 5 and RS 6 work; WFD 6 returns structured insufficiency',()=>{
 assert.equal(build({mode:'task',taskTypes:[wfd],itemCount:5}).itemIds.length,5);assert.equal(build({mode:'task',taskTypes:[rs],itemCount:6}).itemIds.length,6);
 assert.throws(()=>build({mode:'task',taskTypes:[wfd],itemCount:6}),e=>e.code==='INSUFFICIENT_CONTENT'&&e.details.requested===6&&e.details.available===5&&e.details.byTask[wfd]===5&&e.details.byTask[ra]===0&&Object.isFrozen(e.details.byTask));
});
test('current bank: Mixed 10 is 4/3/3; difficulty restrictions use actual catalog capacity',()=>{
 const session=build(mixed());assert.deepEqual(counts(session),capacity(4,3,3));assert.deepEqual(taskSequence(session),['wfd','rs','ra','wfd','rs','ra','wfd','rs','ra','wfd']);
 assert.deepEqual(session.config.taskTypes,TASK_ORDER);assert.equal(new Set(session.itemIds).size,10);
 const pool=real.filter(i=>[2,3].includes(i.difficulty)),restricted=build({...mixed(pool.length),difficulties:[2,3]});assert.equal(restricted.itemIds.length,pool.length);assert.ok(restricted.itemIds.every(id=>pool.some(i=>i.id===id)));
 const wfdHard=real.filter(i=>i.taskType===wfd&&i.difficulty===3);assert.equal(wfdHard.length,1);error(()=>build({mode:'task',taskTypes:[wfd],itemCount:2,difficulties:[3]}),'INSUFFICIENT_CONTENT');
});
for(const [n,cap,expected]of [[10,capacity(2,6,6),capacity(2,4,4)],[6,capacity(1,5,5),capacity(1,3,2)],[5,capacity(0,8,8),capacity(0,3,2)],[1,capacity(9,9,9),capacity(1,0,0)],[8,capacity(0,0,8),capacity(0,0,8)]])test(`capacity-aware allocation ${n}, ${JSON.stringify(cap)}`,()=>{
 const allocated=allocateTaskCounts(n,[ra,rs,wfd],cap);assert.deepEqual(allocated,expected);assert.ok(Object.isFrozen(allocated));
 const session=build(mixed(n),candidates(TASK_ORDER.map(t=>cap[t])));assert.deepEqual(counts(session),expected);assert.deepEqual(session.taskTypes,TASK_ORDER.filter(t=>expected[t]>0));assert.deepEqual(session.config.taskTypes,TASK_ORDER);assert.equal(parseStudySession(session).mode,'mixed');
});
test('small mixed queue with one used task can progress and complete with selected-task config preserved',()=>{
 let session=build({mode:'mixed',taskTypes:[ra,wfd],itemCount:1});assert.deepEqual(session.taskTypes,[wfd]);assert.deepEqual(session.config.taskTypes,[wfd,ra]);
 session=recordSessionAttempt(session,{id:'a',sessionId:session.id,itemId:session.itemIds[0],taskType:wfd},0);assert.equal(completeStudySession(session,now).status,'completed');
});
test('Quick uses available tasks, redistributes, and never shrinks below five',()=>{
 const session=build({mode:'quick'},candidates([0,7,0]));assert.deepEqual(session.taskTypes,[rs]);assert.deepEqual(session.config.taskTypes,[rs]);assert.equal(session.itemIds.length,5);
 assert.throws(()=>build({mode:'quick'},candidates([1,1,2])),e=>e.code==='INSUFFICIENT_CONTENT'&&e.details.available===4&&e.details.requested===5);
});
test('Mixed insufficient total reports all selected capacities without unrelated tasks',()=>{
 const raw=mixed(10);assert.throws(()=>build(raw,candidates([2,3,3])),e=>e.code==='INSUFFICIENT_CONTENT'&&e.details.requested===10&&e.details.available===8&&JSON.stringify(e.details.byTask)===JSON.stringify(capacity(2,3,3)));
 error(()=>build({mode:'mixed',taskTypes:[wfd,rs],itemCount:5},candidates([2,2,100])),'INSUFFICIENT_CONTENT');
});
test('eligibility is reused: drafts, retired, unavailable and technical fixtures do not enter queues',()=>{
 const pool=[...real,...candidates([1,1,1]).map((i,n)=>({...i,id:['wfd','rs','ra'][n]+'-900001',status:['draft','retired','active'][n],catalogAvailable:n!==2}))];
 assert.deepEqual(build({mode:'quick'},pool).itemIds,build({mode:'quick'}).itemIds);
 const legacy={...real[0]};for(const k of ['revision','status','source','catalogAvailable'])delete legacy[k];assert.equal(build({mode:'task',taskTypes:[wfd],itemCount:1},[legacy]).itemIds[0],legacy.id);
});
test('bucket sorting is independent of source/caller ordering; selection stays reproducible',()=>{
 const request=mixed(9),before=structuredClone(real),beforeRequest=structuredClone(request);
 const a=build(request,real,()=>.3),b=build({...request,taskTypes:[rs,ra,wfd]},[...real].reverse(),()=>.3);assert.deepEqual(a.itemIds,b.itemIds);assert.deepEqual(real,before);assert.deepEqual(request,beforeRequest);
 const changed=build(request,real,()=>.9);assert.notDeepEqual(changed.itemIds,a.itemIds);assert.deepEqual(counts(changed),counts(a));assert.deepEqual(taskSequence(changed),taskSequence(a));
 const seeded=()=>{let seed=123;return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};};assert.deepEqual(build(request,real,seeded()).itemIds,build(request,real,seeded()).itemIds);
});
test('source duplicates fail rather than inflate capacity or choose last row',()=>{
 error(()=>build({mode:'quick'},[...real,real[0]]),'SESSION_BUILD_FAILED');
 error(()=>build({mode:'quick'},[{...real[0],id:'ra-000010'},...real.slice(1)]),'SESSION_BUILD_FAILED');
 const invalid={...real[0],difficulty:7};error(()=>build({mode:'quick'},[invalid,...real.slice(1)]),'SESSION_BUILD_FAILED');
});
for(const request of [null,[],{}, {mode:'adaptive'},{mode:'quick',itemCount:4},{mode:'quick',taskTypes:TASK_ORDER},{mode:'quick',difficulties:[]},{mode:'quick',difficulties:undefined},{mode:'quick',unknown:true},
 {mode:'task',taskTypes:[] ,itemCount:1},{mode:'task',taskTypes:[wfd,rs],itemCount:1},{mode:'task',taskTypes:[wfd]},
 {mode:'mixed',taskTypes:[wfd],itemCount:1},{mode:'mixed',taskTypes:[wfd,wfd],itemCount:1},{mode:'mixed',taskTypes:['retell-lecture',rs],itemCount:1},
 ...[0,-1,501,1.5,'2',NaN,Infinity].map(itemCount=>({...mixed(),itemCount})),
 ...[[],[0],[6],['2'],[2,2]].map(difficulties=>({...mixed(),difficulties})),{...mixed(),excludeIds:['ra-001']}])test('invalid dynamic request '+JSON.stringify(request),()=>error(()=>validateBuildRequest(request),'INVALID_SESSION_CONFIG'));
test('request getters, sparse arrays and inherited objects fail without reading accessors',()=>{
 let read=false;const request={mode:'quick'};Object.defineProperty(request,'itemCount',{enumerable:true,get(){read=true;return 5;}});error(()=>validateBuildRequest(request),'INVALID_SESSION_CONFIG');assert.equal(read,false);
 error(()=>validateBuildRequest({...mixed(),taskTypes:Array(2)}),'INVALID_SESSION_CONFIG');error(()=>validateBuildRequest(Object.create({mode:'quick'})),'INVALID_SESSION_CONFIG');
});
for(const rng of [undefined,()=>-1,()=>1,()=>NaN,()=>Infinity,()=>{throw Error('private RNG failure');}])test('invalid injected RNG yields safe structured failure',()=>error(()=>build({mode:'quick'},real,rng??null),'SESSION_BUILD_FAILED'));
test('interleaving handles empty buckets and tails without mutating selections',()=>{
 const selections={[wfd]:['w1','w2','w3'],[rs]:['r1'],[ra]:['a1','a2']},before=structuredClone(selections);assert.deepEqual(interleaveTaskSelections(selections),['w1','r1','a1','w2','a2','w3']);assert.deepEqual(selections,before);assert.ok(Object.isFrozen(interleaveTaskSelections(selections)));
});
test('preparation uses interface, canonical query without limit, injected identity/time and no writes',async t=>{
 const db=await database(t);await bootstrapApp(db);const source=createStudyItemsRepository(db),before=await snapshot(db),calls=[];
 const deps={source:{queryPracticeItems:async q=>{calls.push(q);return source.queryPracticeItems(q);}},contentVersion:version,idGenerator:()=> 'prepared-session',now:()=>now,rng:()=>.25};
 const session=await prepareStudySession({...mixed(7),difficulties:[2,3]},deps);assert.equal(session.id,'prepared-session');assert.equal(session.contentVersion,version);assert.deepEqual(calls,[{taskTypes:TASK_ORDER,difficulties:[2,3]}]);assert.deepEqual(await snapshot(db),before);assert.equal(await db.studySessions.count(),0);
 const quick=await prepareStudySession({mode:'quick'},deps);assert.equal(quick.itemIds.length,5);assert.equal(calls.at(-1).limit,undefined);
});
test('preparation validates before dependencies and hides raw source/generator errors',async()=>{
 let calls=0;const deps={source:{queryPracticeItems:async()=>{calls++;throw Error('/private/path database exception');}},contentVersion:version,idGenerator:()=> 's',now:()=>now,rng:()=>0};
 await assert.rejects(prepareStudySession({mode:'task'},deps),e=>e.code==='INVALID_SESSION_CONFIG');assert.equal(calls,0);
 await assert.rejects(prepareStudySession({mode:'quick'},deps),e=>e.code==='SESSION_BUILD_FAILED'&&!e.message.includes('/private'));
 await assert.rejects(prepareStudySession({mode:'quick'},{...deps,source:{queryPracticeItems:async()=>real},idGenerator:()=>{throw Error('private generator exception');}}),e=>e.code==='SESSION_BUILD_FAILED');
});
test('async preparation snapshots validated request before querying',async()=>{
 const request=mixed(5);const session=await prepareStudySession(request,{source:{queryPracticeItems:async()=>{request.itemCount=17;request.taskTypes.reverse();return real;}},contentVersion:version,idGenerator:()=> 's',now:()=>now,rng:()=>0});assert.equal(session.itemIds.length,5);assert.deepEqual(counts(session),capacity(2,2,1));
});
for(const size of [1000,5000])test(`synthetic ${size}: allocation, selection and interleave timing`,t=>{
 const pool=candidates([Math.floor(size/3),Math.floor(size/3),size-2*Math.floor(size/3)]),cap=capacity(...TASK_ORDER.map(task=>pool.filter(i=>i.taskType===task).length));
 let start=performance.now();const allocation=allocateTaskCounts(500,TASK_ORDER,cap);const allocationMs=performance.now()-start;
 start=performance.now();const selections=Object.fromEntries(TASK_ORDER.map(task=>[task,sampleStudyItems(pool.filter(i=>i.taskType===task),allocation[task],()=>.4).map(i=>i.id)]));const samplingMs=performance.now()-start;
 start=performance.now();const queue=interleaveTaskSelections(selections);const interleaveMs=performance.now()-start;
 start=performance.now();const session=build(mixed(500),pool,()=>.4);const fullBuilderMs=performance.now()-start;
 assert.equal(queue.length,500);assert.equal(new Set(session.itemIds).size,500);assert.deepEqual(counts(session),allocation);
 t.diagnostic(JSON.stringify({size,allocationMs,samplingMs,interleaveMs,fullBuilderMs,scope:'Node synthetic candidates; no browser/IndexedDB latency claim'}));
});
