import assert from 'node:assert/strict';
import test from 'node:test';
import { persistExerciseOutcome, ExercisePersistenceError } from '../src/features/study-session/services/persistExerciseOutcome.ts';
import { StudySessionError } from '../src/domain/study-session/errors.ts';
const item={id:'ra-001',taskType:'read-aloud'};
const attempt={id:'a',itemId:item.id,taskType:item.taskType,itemRevision:7,createdAt:'2026-10-14T01:00:00.000Z',score:.8};
const mode={kind:'session',sessionId:'s',expectedIndex:0,expectedItemId:item.id,isFinalItem:false};
const input={item,attempt,errors:[],reviews:[],mode,now:()=> '2026-10-14T01:01:00.000Z'};
const echo={createStudyOutcome:async value=>value};
test('standalone passes unchanged outcome and never reads final clock',async()=>{
 let sent;const result=await persistExerciseOutcome({...input,mode:{kind:'standalone'},now:()=>assert.fail('clock')},{createStudyOutcome:async value=>{sent=value;return value;}});
 assert.equal(sent.attempt,attempt);assert.equal(sent.sessionProgress,undefined);assert.deepEqual(result,{attemptId:'a',itemId:item.id,taskType:item.taskType,score:.8});assert.ok(Object.isFrozen(result));
});
test('session attaches owner to a copy, preserves revision/IDs, injects clock only for final',async()=>{
 const before=structuredClone({item,attempt});let sent;
 const repo={createStudyOutcome:async value=>{sent=value;return {...value,session:{id:'s'}};}};
 const done=await persistExerciseOutcome({...input,now:()=>assert.fail('nonfinal clock')},repo);
 assert.notEqual(sent.attempt,attempt);assert.deepEqual(sent.attempt,{...attempt,sessionId:'s'});
 assert.deepEqual(sent.sessionProgress,{sessionId:'s',expectedIndex:0,expectedItemId:'ra-001'});assert.deepEqual(input.item,before.item);assert.equal(attempt.sessionId,undefined);assert.equal(done.session.id,'s');
 await persistExerciseOutcome({...input,mode:{...mode,isFinalItem:true}},repo);assert.equal(sent.sessionProgress.finishedAt,input.now());
});
for(const change of [ {sessionId:''},{sessionId:' '},{expectedIndex:-1},{expectedIndex:1.5},{expectedIndex:NaN},{expectedIndex:Number.MAX_SAFE_INTEGER+1},{expectedItemId:'ra-002'},{isFinalItem:'yes'} ])test('invalid session context rejected before persistence '+JSON.stringify(change),async()=>{
 await assert.rejects(persistExerciseOutcome({...input,mode:{...mode,...change}},{createStudyOutcome:()=>assert.fail('write')}),e=>e instanceof ExercisePersistenceError&&e.code==='SESSION_ITEM_MISMATCH');
});
test('wrong item/task and prelinked standalone attempt fail before persistence',async()=>{
 for(const value of [{...input,attempt:{...attempt,itemId:'rs-001'}},{...input,attempt:{...attempt,taskType:'repeat-sentence'}},{...input,attempt:{...attempt,sessionId:'different'}},{...input,mode:{kind:'standalone'},attempt:{...attempt,sessionId:'s'}}])await assert.rejects(persistExerciseOutcome(value,{createStudyOutcome:()=>assert.fail('write')}),ExercisePersistenceError);
});
test('raw database detail suppressed; conflict remains a structured reload/resume error',async()=>{
 const repo={createStudyOutcome:async()=>{throw new Error('/private/path sensitive raw DB error');}};
 await assert.rejects(persistExerciseOutcome(input,repo),e=>e.code==='SESSION_PERSISTENCE_FAILED'&&!e.message.includes('private'));
 repo.createStudyOutcome=async()=>{throw new StudySessionError({path:'currentIndex',code:'SESSION_PROGRESS_CONFLICT',message:'private internals'});};
 await assert.rejects(persistExerciseOutcome(input,repo),e=>e.code==='SESSION_PROGRESS_CONFLICT'&&e.message.includes('Resume')&&!e.message.includes('internals'));
});
test('no-score completion omits score',async()=>{const {score:_score,...unscored}=attempt;assert.equal('score' in await persistExerciseOutcome({...input,attempt:unscored},echo),false);});
