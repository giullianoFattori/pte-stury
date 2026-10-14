import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,taskRequest,outcome} from './helpers/session-persistence.mjs';
import {PteDatabase} from '../src/data/db/database.ts';
import {createStudySessionsRepository} from '../src/data/repositories/studySessionsRepository.ts';
import {createStudyOutcomeRepository} from '../src/data/repositories/studyOutcomeRepository.ts';
import {startStudySession} from '../src/application/study-session/startStudySession.ts';
test('two connections prepare concurrently; serialized transaction allows only one active creation',async t=>{
 const c=await setup(t),other=new PteDatabase(c.db.name);await other.open();try{
  let arrived=0,release;const gate=new Promise(r=>release=r);const source={queryPracticeItems:async q=>{const rows=await c.source.queryPracticeItems(q);if(++arrived===2)release();await gate;return rows;}};
  const results=await Promise.allSettled([startStudySession(taskRequest(),{...c.deps,source,idGenerator:()=> 'tab-a'}),startStudySession(taskRequest(),{...c.deps,source,sessions:createStudySessionsRepository(other),idGenerator:()=> 'tab-b'})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'ACTIVE_SESSION_EXISTS');assert.equal(await c.db.studySessions.count(),1);
 }finally{other.close();}
});
for(const count of [2,1])test(`two simultaneous ${count===1?'final':'partial'} outcomes: one advances, stale writer persists nothing`,async t=>{
 const c=await setup(t),s=await c.start(taskRequest(count)),other=new PteDatabase(c.db.name);await other.open();try{
  const results=await Promise.allSettled([c.outcomes.createStudyOutcome(outcome(s,0,'a')),createStudyOutcomeRepository(other).createStudyOutcome(outcome(s,0,'b'))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'SESSION_PROGRESS_CONFLICT');assert.equal(await c.db.attempts.count(),1);assert.equal(await c.db.errors.count(),1);assert.equal(await c.db.reviews.count(),1);
  const row=await c.sessions.getById(s.id);assert.equal(row.currentIndex,1);assert.equal(row.status,count===1?'completed':'active');assert.equal(row.attemptIds.length,1);
 }finally{other.close();}
});
