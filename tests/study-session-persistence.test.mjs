import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,taskRequest,outcome,snapshot,history,now} from './helpers/session-persistence.mjs';
import { progressStudySession } from '../src/application/study-session/progressStudySession.ts';
import { abandonActiveSession } from '../src/application/study-session/abandonStudySession.ts';
import { startStudySession } from '../src/application/study-session/startStudySession.ts';
test('start saves prepared queue immediately, retains legacy rows, blocks another active without preparing it',async t=>{
 const c=await setup(t);await c.db.studySessions.add(history.studySessions[0]);const s=await c.start(taskRequest());assert.deepEqual(await c.sessions.getById(s.id),s);assert.equal((await c.sessions.getActiveVersioned()).id,s.id);
 assert.deepEqual(await c.sessions.getById('s-old'),history.studySessions[0]);let queries=0;await assert.rejects(startStudySession(taskRequest(),{...c.deps,source:{queryPracticeItems:async()=>{queries++;return[];}}}),e=>e.code==='ACTIVE_SESSION_EXISTS');assert.equal(queries,0);assert.equal(c.db.verno,3);
});
test('outcomes and progress save together; final outcome completes with supplied timestamp',async t=>{
 const c=await setup(t),s=await c.start(taskRequest());const saved=await progressStudySession(outcome(s),c.outcomes);assert.equal(saved.session.currentIndex,1);assert.equal(saved.session.status,'active');
 const final=await c.outcomes.createStudyOutcome(outcome(saved.session));assert.equal(final.session.status,'completed');assert.equal(final.session.finishedAt,now);assert.equal(final.session.currentIndex,2);assert.equal(await c.db.attempts.count(),2);assert.equal(await c.db.errors.count(),2);assert.equal(await c.db.reviews.count(),2);
 assert.equal(await c.sessions.getActiveVersioned(),undefined);assert.ok(await c.start(taskRequest(1)));
});
for(const taskType of ['write-from-dictation','repeat-sentence','read-aloud'])test(`${taskType} outcome uses shared transaction and session linkage`,async t=>{
 const c=await setup(t),s=await c.start({mode:'task',taskTypes:[taskType],itemCount:1});const data=outcome(s);await c.outcomes.createStudyOutcome(data);assert.equal((await c.db.attempts.get(data.attempt.id)).sessionId,s.id);assert.equal((await c.sessions.getById(s.id)).status,'completed');
});
test('explicit abandonment preserves partial outcomes; stale index/terminal writes fail; new start allowed',async t=>{
 const c=await setup(t),s=await c.start(taskRequest()),advanced=(await c.outcomes.createStudyOutcome(outcome(s))).session;
 await assert.rejects(abandonActiveSession(s.id,0,now,c.sessions),e=>e.code==='SESSION_PROGRESS_CONFLICT');const ended=await abandonActiveSession(s.id,1,now,c.sessions);assert.equal(ended.status,'abandoned');assert.equal(await c.db.attempts.count(),1);assert.deepEqual(ended.attemptIds,advanced.attemptIds);
 await assert.rejects(c.sessions.abandonActiveSession(s.id,1,now),e=>e.code==='SESSION_NOT_ACTIVE');await assert.rejects(c.outcomes.createStudyOutcome(outcome(ended)),e=>e.code==='SESSION_NOT_ACTIVE');assert.ok(await c.start(taskRequest(1)));
});
for(const phase of ['attempts','errors','reviews','studySessions'])test(`failure at ${phase} rolls back every outcome and progress write`,async t=>{
 const c=await setup(t),s=await c.start(taskRequest(1)),before=await snapshot(c.db);c.db.table(phase).hook(phase==='studySessions'?'updating':'creating',()=>{throw Error('/private/path injected disk failure');});
 await assert.rejects(c.outcomes.createStudyOutcome(outcome(s)),e=>e.code==='SESSION_PERSISTENCE_FAILED'&&!e.message.includes('/private'));assert.deepEqual(await snapshot(c.db),before);
});
for(const [name,change,code]of [
 ['wrong index',v=>v.sessionProgress.expectedIndex=1,'SESSION_PROGRESS_CONFLICT'],['wrong expected item',v=>v.sessionProgress.expectedItemId='ra-006','SESSION_PROGRESS_CONFLICT'],
 ['wrong attempt item',v=>v.attempt.itemId='ra-006','SESSION_ATTEMPT_MISMATCH'],['wrong attempt task',v=>v.attempt.taskType='repeat-sentence','SESSION_ATTEMPT_MISMATCH'],['wrong attempt session',v=>v.attempt.sessionId='other','SESSION_ATTEMPT_MISMATCH'],['no attempt session',v=>delete v.attempt.sessionId,'SESSION_ATTEMPT_MISMATCH'],
 ['wrong error linkage',v=>v.errors[0].attemptId='other','SESSION_ATTEMPT_MISMATCH'],['wrong review linkage',v=>v.reviews[0].sourceErrorId='other','SESSION_ATTEMPT_MISMATCH'],['no final timestamp',v=>delete v.sessionProgress.finishedAt,'INVALID_SESSION_CONFIG'],
])test(name+' cannot write a partial outcome',async t=>{const c=await setup(t),s=await c.start(taskRequest(1)),data=outcome(s),before=await snapshot(c.db);change(data);await assert.rejects(c.outcomes.createStudyOutcome(data),e=>e.code===code);assert.deepEqual(await snapshot(c.db),before);});
test('existing attempt ID conflicts and standalone paths retain unlinked behavior',async t=>{
 const c=await setup(t),s=await c.start(taskRequest(1)),data=outcome(s);await c.db.attempts.add({...data.attempt,sessionId:undefined});const before=await snapshot(c.db);
 await assert.rejects(c.outcomes.createStudyOutcome(data),e=>e.code==='SESSION_PROGRESS_CONFLICT');assert.deepEqual(await snapshot(c.db),before);
 await assert.rejects(c.outcomes.createStudyOutcome({...data,sessionProgress:undefined}),e=>e.code==='SESSION_ATTEMPT_MISMATCH');
 const solo={...data,attempt:{...data.attempt,id:'standalone'},errors:[],reviews:[],sessionProgress:undefined};delete solo.attempt.sessionId;const saved=await c.outcomes.createStudyOutcome(solo);assert.equal('session'in saved,false);assert.equal((await c.db.attempts.get('standalone')).sessionId,undefined);assert.equal((await c.sessions.getById(s.id)).currentIndex,0);
});
test('stale catalog or item availability during preparation rejects creation without storing queue',async t=>{
 const c=await setup(t);const {prepareStudySession}=await import('../src/application/study-session/prepareStudySession.ts');const s=await prepareStudySession(taskRequest(),c.deps);
 await c.db.contentState.update('question-bank',{contentVersion:'sha256:'+'f'.repeat(64)});await assert.rejects(c.sessions.createActive(s),e=>e.code==='SESSION_PROGRESS_CONFLICT');assert.equal(await c.db.studySessions.count(),0);
 await c.db.contentState.update('question-bank',{contentVersion:c.deps.contentVersion});await c.db.studyItems.update(s.itemIds[0],{catalogAvailable:false});await assert.rejects(c.sessions.createActive(s),e=>e.code==='SESSION_ITEM_UNAVAILABLE');
});

test('creation write failure preserves history and leaves no active row',async t=>{
 const c=await setup(t);await c.db.studySessions.add(history.studySessions[0]);const before=await snapshot(c.db);c.db.studySessions.hook('creating',()=>{throw Error('private creation error');});await assert.rejects(c.start(taskRequest()),e=>e.code==='SESSION_PERSISTENCE_FAILED');assert.deepEqual(await snapshot(c.db),before);
});
test('completed session cannot be abandoned and its identity cannot be overwritten',async t=>{
 const c=await setup(t),s=await c.start(taskRequest(1));await c.outcomes.createStudyOutcome(outcome(s));const before=await snapshot(c.db);await assert.rejects(c.sessions.abandonActiveSession(s.id,1,now),e=>e.code==='SESSION_NOT_ACTIVE');await assert.rejects(c.sessions.createActive(s),e=>e.code==='SESSION_PROGRESS_CONFLICT');assert.deepEqual(await snapshot(c.db),before);
});
test('changed structural question data rejects a prepared queue before creation',async t=>{
 const c=await setup(t);const {prepareStudySession}=await import('../src/application/study-session/prepareStudySession.ts');const s=await prepareStudySession(taskRequest(),c.deps);await c.db.studyItems.update(s.itemIds[1],{transcript:''});await assert.rejects(c.sessions.createActive(s),e=>e.code==='SESSION_ITEM_UNAVAILABLE');assert.equal(await c.db.studySessions.count(),0);
});
