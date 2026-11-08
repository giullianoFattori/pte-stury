import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { readTaskData, taskDataIssues } from '../src/domain/content/taskDataValidation.ts';
import { isPracticeReadyTask, PRACTICE_TASK_ORDER, QUICK_TASK_POOL } from '../src/domain/pte/taskRegistry.ts';
const items=await Promise.all(Array.from({length:6},async(_,i)=>JSON.parse(await readFile(new URL(`../content/answer-short-question/asq-00000${i+1}.json`,import.meta.url),'utf8'))));
test('six published ASQ items have authored short answers and 3–9 second local audio',()=>{
 assert.deepEqual(items.map(item=>item.id),Array.from({length:6},(_,i)=>`asq-00000${i+1}`));
 for(const item of items){const data=readTaskData(item,'answer-short-question');assert.ok(data.questionTranscript.trim());assert.ok(data.acceptedAnswers.length);assert.ok(data.audio.durationMs>=3000&&data.audio.durationMs<=9000);assert.ok(data.audio.sha256);}
});
test('ASQ accepted answers are unique after normalization; task readiness leaves Quick unchanged',()=>{
 const item=structuredClone(items[0]);item.taskData.acceptedAnswers=['Dictionary',' dictionary.'];assert.ok(taskDataIssues('answer-short-question',item.taskData,true).issues.length);
 assert.equal(isPracticeReadyTask('answer-short-question'),true);assert.equal(PRACTICE_TASK_ORDER.length,16);assert.deepEqual(QUICK_TASK_POOL,['write-from-dictation','repeat-sentence','read-aloud']);
});
