import assert from 'node:assert/strict';
import test from 'node:test';
import { KNOWN_TASK_ORDER, WAVE1_TASKS, FOUNDATION_TASKS, TASK_REGISTRY, PRACTICE_TASK_ORDER, QUICK_TASK_POOL, TASK_ID_PREFIXES } from '../src/domain/pte/taskRegistry.ts';
import { SESSION_SUMMARY_TASKS } from '../src/domain/study-session/summary.ts';
import { PTE_SPEC_VERSION } from '../src/domain/pte/spec.ts';
import { validateBuildRequest } from '../src/domain/study-session/buildRequest.ts';
import { prepareStudySession } from '../src/application/study-session/prepareStudySession.ts';
import { initialRegistry, simulateIds } from '../tools/content/ids.mjs';
const wave=['retell-lecture','summarize-group-discussion','describe-image','summarize-written-text','summarize-spoken-text','highlight-incorrect-words'];
test('exact Wave 1 known identities, canonical order, metadata and independent Quick pool',()=>{
 assert.deepEqual(WAVE1_TASKS,wave);assert.equal(new Set(KNOWN_TASK_ORDER).size,9);assert.deepEqual(KNOWN_TASK_ORDER,[...FOUNDATION_TASKS,...wave]);
 assert.deepEqual(PRACTICE_TASK_ORDER,[...FOUNDATION_TASKS,'retell-lecture','summarize-group-discussion','describe-image','summarize-written-text','summarize-spoken-text']);assert.deepEqual(QUICK_TASK_POOL,FOUNDATION_TASKS);assert.deepEqual(validateBuildRequest({mode:'quick'}).taskTypes,FOUNDATION_TASKS);
 assert.deepEqual(SESSION_SUMMARY_TASKS,[...FOUNDATION_TASKS,'retell-lecture','summarize-group-discussion','describe-image','summarize-written-text','summarize-spoken-text']);assert.equal(PTE_SPEC_VERSION,'2026-10-01');
 assert.deepEqual(wave.map(t=>TASK_REGISTRY[t].skills),[['listening','speaking'],['listening','speaking'],['speaking'],['reading','writing'],['listening','writing'],['listening','reading']]);
 assert.deepEqual(wave.map(t=>TASK_ID_PREFIXES[t]),['rtl','sgd','di','swt','sst','hiw']);
 for(const task of KNOWN_TASK_ORDER){const d=TASK_REGISTRY[task];assert.equal(d.taskType,task);assert.ok(d.label.length);assert.ok(Object.isFrozen(d)&&Object.isFrozen(d.skills));assert.equal(d.wave,wave.includes(task)?'wave-1':'foundation');}
 assert.deepEqual(wave.map(t=>TASK_REGISTRY[t].section),['speaking-writing','speaking-writing','speaking-writing','speaking-writing','listening','listening']);
});
for(const task of wave.filter(task=>!TASK_REGISTRY[task].practiceReady))test(`unfinished ${task} rejected at application selection before query/ID/clock`,async()=>{
 await assert.rejects(prepareStudySession({mode:'task',itemCount:1,taskTypes:[task]},{source:{queryPracticeItems:()=>assert.fail('query')},idGenerator:()=>assert.fail('id'),now:()=>assert.fail('clock'),rng:()=>assert.fail('rng')}),e=>e.code==='INVALID_SESSION_CONFIG');
});
test('practice-ready tasks each have explicit dispatch and session summary support',async()=>{
 const { readFile }=await import('node:fs/promises');const dispatcher=await readFile(new URL('../src/features/study-session/components/StudyItemExercise.tsx',import.meta.url),'utf8');
 for(const task of PRACTICE_TASK_ORDER){assert.ok(SESSION_SUMMARY_TASKS.includes(task));assert.ok(dispatcher.includes(`'${task}':`));}
 const describe=await readFile(new URL('../src/features/describe-image/DescribeImageExercise.tsx',import.meta.url),'utf8');assert.match(describe,/useExercisePersistence/);assert.match(describe,/buildDescribeImageAttempt/);assert.match(describe,/buildDescribeImageErrorRecords/);assert.match(describe,/buildDescribeImageReviewItems/);
 const swt=await readFile(new URL('../src/features/summarize-written-text/SummarizeWrittenTextExercise.tsx',import.meta.url),'utf8');assert.match(swt,/useExercisePersistence/);assert.match(swt,/buildSummarizeWrittenTextAttempt/);assert.match(swt,/buildSummarizeWrittenTextErrorRecords/);assert.match(swt,/buildSummarizeWrittenTextReviewItems/);
 const sst=await readFile(new URL('../src/features/summarize-spoken-text/SummarizeSpokenTextExercise.tsx',import.meta.url),'utf8');assert.match(sst,/useExercisePersistence/);assert.match(sst,/buildSummarizeSpokenTextAttempt/);assert.match(sst,/buildSummarizeSpokenTextErrorRecords/);assert.match(sst,/buildSummarizeSpokenTextReviewItems/);
 assert.equal(TASK_REGISTRY['retell-lecture'].practiceReady,true);assert.equal(TASK_REGISTRY['summarize-group-discussion'].practiceReady,true);assert.equal(TASK_REGISTRY['describe-image'].practiceReady,true);assert.equal(TASK_REGISTRY['summarize-written-text'].practiceReady,true);assert.equal(TASK_REGISTRY['summarize-spoken-text'].practiceReady,true);
});
test('new prefixes reserve normal six-digit identities without consuming permanent technical IDs',()=>{
 const registry=initialRegistry();assert.equal(registry.entries.filter(r=>r.kind==='legacy').length,17);assert.equal(registry.entries.filter(r=>r.kind==='technical').length,9);
 assert.deepEqual(simulateIds(registry,wave),['rtl-000001','sgd-000001','di-000001','swt-000001','sst-000001','hiw-000001']);
});
