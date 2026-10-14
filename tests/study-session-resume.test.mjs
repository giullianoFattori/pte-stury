import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,taskRequest,outcome,history,now,snapshot} from './helpers/session-persistence.mjs';
import {resumeStudySession,findResumableStudySession} from '../src/application/study-session/resumeStudySession.ts';
import {PteDatabase} from '../src/data/db/database.ts';
import {createStudySessionsRepository} from '../src/data/repositories/studySessionsRepository.ts';
test('close/reopen resumes exact queue/current position and original catalog identity',async t=>{
 const c=await setup(t),s=await c.start(taskRequest(3));await c.outcomes.createStudyOutcome(outcome(s));c.db.close();const reopened=new PteDatabase(c.db.name);await reopened.open();try{
  const sessions=createStudySessionsRepository(reopened),resumed=await resumeStudySession(s.id,sessions);assert.equal(resumed.kind,'item');assert.equal(resumed.session.currentIndex,1);assert.deepEqual(resumed.session.itemIds,s.itemIds);assert.equal(resumed.item.id,s.itemIds[1]);assert.equal(resumed.isCatalogCurrent,true);
  await reopened.contentState.update('question-bank',{contentVersion:'sha256:'+'b'.repeat(64)});await reopened.studyItems.update(s.itemIds[1],{status:'retired',catalogAvailable:false});const changed=await findResumableStudySession(sessions);assert.equal(changed.isCatalogCurrent,false);assert.equal(changed.item.catalogAvailable,false);assert.equal(changed.item.status,'retired');assert.deepEqual(changed.session.itemIds,s.itemIds);assert.equal(changed.session.contentVersion,s.contentVersion);
  const {createStudyOutcomeRepository}=await import('../src/data/repositories/studyOutcomeRepository.ts');assert.equal((await createStudyOutcomeRepository(reopened).createStudyOutcome(outcome(changed.session))).session.currentIndex,2);
 }finally{reopened.close();await c.db.open();}
});
for(const kind of ['missing','incomplete','audioConflict'])test(kind+' queued item fails explicitly without skipping',async t=>{
 const c=await setup(t),s=await c.start({mode:'task',taskTypes:['repeat-sentence'],itemCount:1});const id=s.itemIds[0];
 if(kind==='missing')await c.db.studyItems.delete(id);else if(kind==='incomplete')await c.db.studyItems.update(id,{transcript:''});else await c.db.studyItems.update(id,{audioUrl:'/audio/rs/other.mp3'});
 const before=await snapshot(c.db);await assert.rejects(c.sessions.resumeActive(s.id),e=>e.code===(kind==='audioConflict'?'SESSION_ITEM_MISMATCH':'SESSION_ITEM_UNAVAILABLE'));assert.deepEqual(await snapshot(c.db),before);
});
test('legacy rows remain historical, never auto-converted or selected for resume',async t=>{
 const c=await setup(t);await c.db.studySessions.add(history.studySessions[0]);assert.equal(await findResumableStudySession(c.sessions),undefined);await assert.rejects(c.sessions.resumeActive('s-old'),e=>e.code==='LEGACY_SESSION_NOT_RESUMABLE');assert.deepEqual(await c.sessions.getById('s-old'),history.studySessions[0]);await assert.rejects(c.sessions.resumeActive('absent'),e=>e.code==='SESSION_NOT_FOUND');
});
test('malformed stored rows and multiple active rows fail closed on lookup/start/resume',async t=>{
 const c=await setup(t),s=await c.start(taskRequest());await c.db.studySessions.update(s.id,{currentIndex:999});await assert.rejects(c.sessions.getById(s.id),e=>e.code==='SESSION_STORAGE_CORRUPT');await assert.rejects(c.sessions.getActiveVersioned(),e=>e.code==='SESSION_STORAGE_CORRUPT');
 await c.db.studySessions.put(s);await c.db.studySessions.add({...s,id:'duplicate-active'});for(const action of [()=>c.sessions.getActiveVersioned(),()=>c.sessions.resumeActive(s.id),()=>c.start(taskRequest())])await assert.rejects(action(),e=>e.code==='MULTIPLE_ACTIVE_SESSIONS');
});
test('old exhausted-active session resumes as completion-pending and finalizes without duplicate attempt',async t=>{
 const c=await setup(t),s=await c.start(taskRequest(1)),data=outcome(s);await c.db.attempts.add(data.attempt);await c.db.studySessions.put({...s,currentIndex:1,attemptIds:[data.attempt.id]});const resumed=await c.sessions.resumeActive(s.id);assert.equal(resumed.kind,'completion-pending');assert.equal('item'in resumed,false);assert.equal((await c.sessions.completeActiveSession(s.id,1,now)).status,'completed');assert.equal(await c.db.attempts.count(),1);
});
test('missing/mismatched saved attempt references are controlled storage corruption',async t=>{
 const c=await setup(t),s=await c.start(taskRequest());await c.db.studySessions.update(s.id,{currentIndex:1,attemptIds:['missing-attempt']});await assert.rejects(c.sessions.resumeActive(s.id),e=>e.code==='SESSION_STORAGE_CORRUPT');
});
