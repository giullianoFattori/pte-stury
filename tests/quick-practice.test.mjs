import assert from 'node:assert/strict';
import test from 'node:test';
import { setup, snapshot, now } from './helpers/session-persistence.mjs';
import { exerciseOutcome } from './helpers/exercise-outcome.mjs';
import { startQuickPractice } from '../src/features/study-session/services/startQuickPractice.ts';
import { loadStudySession, sessionMessage } from '../src/features/study-session/services/loadStudySession.ts';
import { persistExerciseOutcome } from '../src/features/study-session/services/persistExerciseOutcome.ts';
import { StudySessionError } from '../src/domain/study-session/errors.ts';
const deps=h=>({...h.deps,getContentVersion:async()=> (await h.db.contentState.get('question-bank'))?.contentVersion});
test('Quick creates exactly five unique balanced items with installed content identity; repeat start resumes',async t=>{
 const h=await setup(t),result=await startQuickPractice(deps(h)),session=result.session;
 assert.equal(result.kind,'started');assert.equal(session.mode,'quick');assert.equal(session.itemIds.length,5);assert.equal(new Set(session.itemIds).size,5);assert.equal(session.contentVersion,h.deps.contentVersion);assert.deepEqual(session.taskTypes,['write-from-dictation','repeat-sentence','read-aloud']);
 assert.deepEqual(session.itemIds.map(id=>id.split('-')[0]),['wfd','rs','ra','wfd','rs']);
 const before=await snapshot(h.db),again=await startQuickPractice(deps(h));assert.equal(again.kind,'resume');assert.equal(again.session.id,session.id);assert.deepEqual(await snapshot(h.db),before);
});
test('two simultaneous Quick requests leave exactly one queue and return started/resume',async t=>{
 const h=await setup(t),d=deps(h);const results=await Promise.all([startQuickPractice(d),startQuickPractice(d)]);
 assert.deepEqual(results.map(r=>r.kind).sort(),['resume','started']);assert.equal(results[0].session.id,results[1].session.id);assert.equal(await h.db.studySessions.count(),1);
});
test('missing installed identity and insufficient bank do not save a session',async t=>{
 const h=await setup(t);await assert.rejects(startQuickPractice({...deps(h),getContentVersion:async()=>undefined}),e=>e.code==='SESSION_STORAGE_CORRUPT');
 await assert.rejects(startQuickPractice({...deps(h),source:{queryPracticeItems:async()=>[]}}),e=>e.code==='INSUFFICIENT_CONTENT');assert.equal(await h.db.studySessions.count(),0);
});
test('resume any active mode rather than replacing it with Quick',async t=>{
 const h=await setup(t),old=await h.start({mode:'task',taskTypes:['read-aloud'],itemCount:1});const result=await startQuickPractice(deps(h));assert.equal(result.kind,'resume');assert.equal(result.session.id,old.id);assert.equal(result.session.mode,'task');
});
test('route reopens frozen queue at persisted position, final save loads completed route',async t=>{
 const h=await setup(t),{session}=await startQuickPractice(deps(h));
 for(let index=0;index<5;index++){
  const view=await loadStudySession(session.id,h.sessions);assert.equal(view.kind,'item');assert.equal(view.session.currentIndex,index);assert.equal(view.item.id,session.itemIds[index]);assert.deepEqual(view.session.itemIds,session.itemIds);
  // Refresh before save leaves current item unchanged.
  assert.equal((await loadStudySession(session.id,h.sessions)).item.id,view.item.id);
  await persistExerciseOutcome({...exerciseOutcome(view.item),item:view.item,mode:{kind:'session',sessionId:session.id,expectedIndex:index,expectedItemId:view.item.id,isFinalItem:index===4},now:()=>now},h.outcomes);
  const refreshed=await loadStudySession(session.id,h.sessions);assert.equal(refreshed.session.currentIndex,index+1);assert.equal(refreshed.kind,index===4?'completed':'item');
 }
 const done=await loadStudySession(session.id,h.sessions);assert.equal(done.session.attemptIds.length,5);assert.equal(done.session.status,'completed');
});
test('resume preserves queue when catalog changes; historical unavailable item still resolves',async t=>{
 const h=await setup(t),{session}=await startQuickPractice(deps(h));await h.db.studyItems.update(session.itemIds[0],{catalogAvailable:false,status:'retired'});await h.db.contentState.update('question-bank',{contentVersion:'sha256:'+'f'.repeat(64)});
 const result=await loadStudySession(session.id,h.sessions);assert.equal(result.item.id,session.itemIds[0]);assert.equal(result.isCatalogCurrent,false);
});
test('not found, malformed, abandoned and legacy rows have safe route errors',async t=>{
 const h=await setup(t);await assert.rejects(loadStudySession('missing',h.sessions),e=>e.code==='SESSION_NOT_FOUND');
 const {session}=await startQuickPractice(deps(h));await h.sessions.abandonActiveSession(session.id,0,now);await assert.rejects(loadStudySession(session.id,h.sessions),e=>e.code==='SESSION_NOT_ACTIVE');
 await h.db.studySessions.add({id:'legacy',startedAt:now,taskTypes:['read-aloud'],attemptIds:[]});await assert.rejects(loadStudySession('legacy',h.sessions),e=>e.code==='LEGACY_SESSION_NOT_RESUMABLE');
 await h.db.studySessions.put({...session,currentIndex:-1});await assert.rejects(loadStudySession(session.id,h.sessions),e=>e.code==='SESSION_STORAGE_CORRUPT');
 assert.doesNotMatch(sessionMessage(new Error('/private/path database internals')),/private|internals/);
});
test('completed concurrently between route read and resume displays completion',async t=>{
 const h=await setup(t),{session}=await startQuickPractice(deps(h));let reads=0;const completed={...session,currentIndex:5,attemptIds:['a','b','c','d','e'],status:'completed',finishedAt:now};
 const sessions={...h.sessions,getById:async()=>++reads===1?session:completed,resumeActive:async()=>{throw new StudySessionError({code:'SESSION_NOT_ACTIVE',path:'session',message:'not active'});}};
 assert.equal((await loadStudySession(session.id,sessions)).kind,'completed');
});
test('older verified exhausted-active queue recovers completion without another outcome',async t=>{
 const h=await setup(t),{session}=await startQuickPractice(deps(h));
 for(let i=0;i<5;i++){
  const item=await h.source.getById(session.itemIds[i]);await persistExerciseOutcome({...exerciseOutcome(item),item,mode:{kind:'session',sessionId:session.id,expectedIndex:i,expectedItemId:item.id,isFinalItem:i===4},now:()=>now},h.outcomes);
 }
 const completed=await h.sessions.getById(session.id),{finishedAt:_finishedAt,...older}=completed;await h.db.studySessions.put({...older,status:'active'});
 const before=await h.db.attempts.toArray();const result=await loadStudySession(session.id,h.sessions,()=>now);assert.equal(result.kind,'completed');assert.equal(result.session.finishedAt,now);assert.deepEqual(await h.db.attempts.toArray(),before);
});
