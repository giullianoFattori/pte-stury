import assert from 'node:assert/strict';
import test from 'node:test';
import { setup, snapshot } from './helpers/session-persistence.mjs';
import { exerciseOutcome } from './helpers/exercise-outcome.mjs';
import { persistExerciseOutcome } from '../src/features/study-session/services/persistExerciseOutcome.ts';
for(const taskType of ['write-from-dictation','repeat-sentence','read-aloud']){
 test(taskType+' actual factories save standalone without creating session state',async t=>{
  const h=await setup(t),item=(await h.source.getByTaskType(taskType))[0],outcome=exerciseOutcome(item);
  await persistExerciseOutcome({...outcome,item,mode:{kind:'standalone'},now:()=>assert.fail('clock')},h.outcomes);
  assert.deepEqual(await h.db.attempts.get(outcome.attempt.id),outcome.attempt);assert.equal(await h.db.studySessions.count(),0);assert.equal((await h.db.errors.toArray()).length,outcome.errors.length);assert.equal((await h.db.reviews.toArray()).length,outcome.reviews.length);
 });
 test(taskType+' actual factories advance once, final save completes atomically',async t=>{
  const h=await setup(t),session=await h.start({mode:'task',taskTypes:[taskType],itemCount:2});
  for(let i=0;i<2;i++){
   const item=await h.source.getById(session.itemIds[i]),outcome=exerciseOutcome(item),before=structuredClone(outcome);
   const mode={kind:'session',sessionId:session.id,expectedIndex:i,expectedItemId:item.id,isFinalItem:i===1};
   const result=await persistExerciseOutcome({...outcome,item,mode,now:()=> '2026-10-14T02:00:00.000Z'},h.outcomes);
   assert.deepEqual(outcome,before);assert.equal((await h.db.attempts.get(outcome.attempt.id)).sessionId,session.id);assert.equal(result.session.currentIndex,i+1);assert.equal(result.session.status,i===1?'completed':'active');assert.equal(result.session.finishedAt,i===1?'2026-10-14T02:00:00.000Z':undefined);
   const snapshotBefore=await snapshot(h.db);await assert.rejects(persistExerciseOutcome({...exerciseOutcome(item),item,mode,now:()=> '2026-10-14T02:00:00.000Z'},h.outcomes),e=>e.code==='SESSION_PROGRESS_CONFLICT');assert.deepEqual(await snapshot(h.db),snapshotBefore);
  }
 });
 test(taskType+' failed session put rolls back outcome and allows retry',async t=>{
  const h=await setup(t),session=await h.start({mode:'task',taskTypes:[taskType],itemCount:1}),item=await h.source.getById(session.itemIds[0]),outcome=exerciseOutcome(item);
  const input={...outcome,item,mode:{kind:'session',sessionId:session.id,expectedIndex:0,expectedItemId:item.id,isFinalItem:true},now:()=> '2026-10-14T02:00:00.000Z'};
  const old=h.db.studySessions.put;h.db.studySessions.put=async()=>{throw new Error('injected write failure');};const before=await snapshot(h.db);
  await assert.rejects(persistExerciseOutcome(input,h.outcomes),e=>e.code==='SESSION_PERSISTENCE_FAILED');assert.deepEqual(await snapshot(h.db),before);h.db.studySessions.put=old;
  assert.equal((await persistExerciseOutcome(input,h.outcomes)).session.status,'completed');
 });
}
