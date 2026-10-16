import assert from 'node:assert/strict';
import test from 'node:test';
import { setup, now, outcome } from './helpers/session-persistence.mjs';
import { exerciseOutcome } from './helpers/exercise-outcome.mjs';
import { persistExerciseOutcome } from '../src/features/study-session/services/persistExerciseOutcome.ts';
import { endStudySession } from '../src/features/study-session/services/endStudySession.ts';
import { loadStudySession, sessionMessage } from '../src/features/study-session/services/loadStudySession.ts';
import { sessionHeading, sessionModeLabel } from '../src/features/study-session/services/sessionPresentation.ts';
const request={mode:'task',taskTypes:['write-from-dictation'],itemCount:3};
async function savedHistory(db){return {attempts:await db.attempts.toArray(),errors:await db.errors.toArray(),reviews:await db.reviews.toArray()};}
test('End reads fresh persisted progress after feedback; preserves outcomes and permits another session',async t=>{
 const h=await setup(t),session=await h.start(request),item=await h.source.getById(session.itemIds[0]),value=exerciseOutcome(item);
 await persistExerciseOutcome({...value,item,mode:{kind:'session',sessionId:session.id,expectedIndex:0,expectedItemId:item.id,isFinalItem:false},now:()=>now},h.outcomes);
 const history=await savedHistory(h.db);assert.ok(history.errors.length);assert.ok(history.reviews.length);let expected;
 const sessions={...h.sessions,abandonActiveSession:async(id,index,date)=>{expected=index;return h.sessions.abandonActiveSession(id,index,date);}};
 const result=await endStudySession(session.id,()=>now,sessions);assert.equal(result.kind,'ended');assert.equal(expected,1);assert.equal(result.session.status,'abandoned');assert.equal(result.session.finishedAt,now);assert.deepEqual(await savedHistory(h.db),history);
 assert.equal((await loadStudySession(session.id,h.sessions)).kind,'abandoned');assert.equal(await h.sessions.getActiveVersioned(),undefined);assert.ok(await h.start({mode:'quick'}));
});
test('unsaved End stores abandonment at zero; reads/resume never abandon',async t=>{
 const h=await setup(t),session=await h.start(request);await loadStudySession(session.id,h.sessions);await loadStudySession(session.id,h.sessions);assert.equal((await h.sessions.getById(session.id)).status,'active');
 const result=await endStudySession(session.id,()=>now,h.sessions);assert.equal(result.session.currentIndex,0);assert.equal(await h.db.attempts.count(),0);
});
test('advance after fresh read shows new active view and never retries abandonment',async t=>{
 const h=await setup(t),session=await h.start(request);let calls=0;const sessions={...h.sessions,abandonActiveSession:async(id,index,date)=>{calls++;await h.outcomes.createStudyOutcome(outcome(session));return h.sessions.abandonActiveSession(id,index,date);}};
 const result=await endStudySession(session.id,()=>now,sessions);assert.equal(result.kind,'changed');assert.equal(result.view.kind,'item');assert.equal(result.view.session.currentIndex,1);assert.equal(result.view.session.status,'active');assert.equal(calls,1);assert.equal(await h.db.attempts.count(),1);
});
test('final save during abandon shows completed and never falsely claims ended',async t=>{
 const h=await setup(t),session=await h.start({...request,itemCount:1});const sessions={...h.sessions,abandonActiveSession:async(id,index,date)=>{await h.outcomes.createStudyOutcome(outcome(session));return h.sessions.abandonActiveSession(id,index,date);}};
 const result=await endStudySession(session.id,()=>now,sessions);assert.equal(result.kind,'changed');assert.equal(result.view.kind,'completed');assert.equal((await h.sessions.getById(session.id)).status,'completed');
});
for(const terminal of ['completed','abandoned'])test('already '+terminal+' returns terminal view without another clock/write',async t=>{
 const h=await setup(t),session=await h.start({...request,itemCount:1});if(terminal==='completed')await h.outcomes.createStudyOutcome(outcome(session));else await h.sessions.abandonActiveSession(session.id,0,now);
 const result=await endStudySession(session.id,()=>assert.fail('clock'),{...h.sessions,abandonActiveSession:()=>assert.fail('write')});assert.equal(result.kind,'changed');assert.equal(result.view.kind,terminal);
});
test('another-tab abandonment between read and resume produces ended route view',async t=>{
 const h=await setup(t),session=await h.start(request);const sessions={...h.sessions,resumeActive:async id=>{await h.sessions.abandonActiveSession(id,0,now);return h.sessions.resumeActive(id);}};
 assert.equal((await loadStudySession(session.id,sessions)).kind,'abandoned');
});
test('failed abandon leaves state/history intact and allows explicit retry',async t=>{
 const h=await setup(t),session=await h.start(request),before=await savedHistory(h.db);
 await assert.rejects(endStudySession(session.id,()=>now,{...h.sessions,abandonActiveSession:async()=>{throw new Error('injected');}}));assert.equal((await h.sessions.getById(session.id)).status,'active');assert.deepEqual(await savedHistory(h.db),before);
 assert.equal((await endStudySession(session.id,()=>now,h.sessions)).kind,'ended');
});
test('safe missing/corrupt/legacy views and mode labels',async t=>{
 const h=await setup(t);await assert.rejects(loadStudySession('missing',h.sessions),e=>e.code==='SESSION_NOT_FOUND');assert.doesNotMatch(sessionMessage(new Error('private path')),/private/);
 const task=await h.start(request);assert.equal(sessionHeading(task),'Task Practice · Write From Dictation');assert.equal(sessionModeLabel(task),'Task Practice');
 await h.sessions.abandonActiveSession(task.id,0,now);const quick=await h.start({mode:'quick'});assert.equal(sessionHeading(quick),'Quick Practice');await h.sessions.abandonActiveSession(quick.id,0,now);
 const mixed=await h.start({mode:'mixed',taskTypes:['read-aloud','repeat-sentence'],itemCount:3});assert.equal(sessionHeading(mixed),'Mixed Practice');
 await h.db.studySessions.put({...mixed,currentIndex:-1});await assert.rejects(loadStudySession(mixed.id,h.sessions),e=>e.code==='SESSION_STORAGE_CORRUPT'&&sessionMessage(e)==='This study session could not be loaded safely.');
 await h.db.studySessions.delete(mixed.id);await h.db.studySessions.add({id:'legacy-nav',startedAt:now,taskTypes:['read-aloud'],attemptIds:[]});await assert.rejects(loadStudySession('legacy-nav',h.sessions),e=>e.code==='LEGACY_SESSION_NOT_RESUMABLE');
});
