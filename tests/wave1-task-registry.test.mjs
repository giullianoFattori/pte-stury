import assert from 'node:assert/strict';
import test from 'node:test';
import { KNOWN_TASK_ORDER, IMPLEMENTATION_TASK_ORDER, WAVE1_TASKS, WAVE2_TASKS, FOUNDATION_TASKS, TASK_REGISTRY, PRACTICE_TASK_ORDER, QUICK_TASK_POOL, TASK_ID_PREFIXES } from '../src/domain/pte/taskRegistry.ts';
import { SESSION_SUMMARY_TASKS } from '../src/domain/study-session/summary.ts';
import { PTE_SPEC_VERSION } from '../src/domain/pte/spec.ts';
import { validateBuildRequest } from '../src/domain/study-session/buildRequest.ts';
import { prepareStudySession } from '../src/application/study-session/prepareStudySession.ts';
import { initialRegistry, simulateIds } from '../tools/content/ids.mjs';
const wave=['retell-lecture','summarize-group-discussion','describe-image','summarize-written-text','summarize-spoken-text','highlight-incorrect-words'];
test('exact Wave 1 known identities, canonical order, metadata and independent Quick pool',()=>{
 assert.deepEqual(WAVE1_TASKS,wave);assert.equal(new Set(KNOWN_TASK_ORDER).size,22);assert.deepEqual(KNOWN_TASK_ORDER,[...FOUNDATION_TASKS,...wave,...WAVE2_TASKS]);assert.deepEqual(IMPLEMENTATION_TASK_ORDER,KNOWN_TASK_ORDER);
 assert.deepEqual(PRACTICE_TASK_ORDER,[...FOUNDATION_TASKS,...wave,'listening-fill-blanks-type-in','reading-fill-blanks-dropdown','reading-fill-blanks-drag-drop','reorder-paragraph','respond-to-a-situation']);assert.deepEqual(QUICK_TASK_POOL,FOUNDATION_TASKS);assert.deepEqual(validateBuildRequest({mode:'quick'}).taskTypes,FOUNDATION_TASKS);
 assert.deepEqual(SESSION_SUMMARY_TASKS,[...FOUNDATION_TASKS,...wave,'listening-fill-blanks-type-in','reading-fill-blanks-dropdown','reading-fill-blanks-drag-drop','reorder-paragraph','respond-to-a-situation']);assert.equal(PTE_SPEC_VERSION,'2026-10-01');
 assert.deepEqual(wave.map(t=>TASK_REGISTRY[t].skills),[['listening','speaking'],['listening','speaking'],['speaking'],['reading','writing'],['listening','writing'],['listening','reading']]);
 assert.deepEqual(wave.map(t=>TASK_ID_PREFIXES[t]),['rtl','sgd','di','swt','sst','hiw']);
 for(const task of KNOWN_TASK_ORDER){const d=TASK_REGISTRY[task];assert.equal(d.taskType,task);assert.ok(d.label.length);assert.ok(Object.isFrozen(d)&&Object.isFrozen(d.skills));assert.equal(d.wave,wave.includes(task)?'wave-1':WAVE2_TASKS.includes(task)?'wave-2':'foundation');}
 assert.deepEqual(wave.map(t=>TASK_REGISTRY[t].section),['speaking-writing','speaking-writing','speaking-writing','speaking-writing','listening','listening']);
});
for(const task of wave.filter(task=>!TASK_REGISTRY[task].practiceReady))test(`unfinished ${task} rejected at application selection before query/ID/clock`,async()=>{
 await assert.rejects(prepareStudySession({mode:'task',itemCount:1,taskTypes:[task]},{source:{queryPracticeItems:()=>assert.fail('query')},idGenerator:()=>assert.fail('id'),now:()=>assert.fail('clock'),rng:()=>assert.fail('rng')}),e=>e.code==='INVALID_SESSION_CONFIG');
});
test('practice-ready tasks each have explicit dispatch and session summary support',async()=>{
 const { readFile }=await import('node:fs/promises');const dispatcher=await readFile(new URL('../src/features/study-session/components/StudyItemExercise.tsx',import.meta.url),'utf8');
 const paths={ 'retell-lecture':'retell-lecture/RetellLectureExercise.tsx','summarize-group-discussion':'summarize-group-discussion/SummarizeGroupDiscussionExercise.tsx','describe-image':'describe-image/DescribeImageExercise.tsx','summarize-written-text':'summarize-written-text/SummarizeWrittenTextExercise.tsx','summarize-spoken-text':'summarize-spoken-text/SummarizeSpokenTextExercise.tsx','highlight-incorrect-words':'highlight-incorrect-words/HighlightIncorrectWordsExercise.tsx','listening-fill-blanks-type-in':'listening-fill-blanks/ListeningFillBlanksTypeInExercise.tsx','reading-fill-blanks-dropdown':'reading-fill-blanks-dropdown/ReadingFillBlanksDropdownExercise.tsx','reading-fill-blanks-drag-drop':'reading-fill-blanks-drag-drop/ReadingFillBlanksDragDropExercise.tsx','reorder-paragraph':'reorder-paragraph/ReorderParagraphExercise.tsx','respond-to-a-situation':'respond-to-a-situation/RespondToSituationExercise.tsx' };
 for(const task of PRACTICE_TASK_ORDER){assert.ok(SESSION_SUMMARY_TASKS.includes(task));assert.ok(dispatcher.includes(`'${task}':`));assert.equal(TASK_REGISTRY[task].practiceReady,true);if(task==='listening-fill-blanks-type-in'){const exercise=await readFile(new URL('../src/features/listening-fill-blanks/ListeningFillBlanksTypeInExercise.tsx',import.meta.url),'utf8');for(const required of ['useExercisePersistence','buildListeningFillBlanksAttempt','buildListeningFillBlanksErrorRecords','buildListeningFillBlanksReviewItems'])assert.ok(exercise.includes(required));continue;}if(!wave.includes(task)&&!['reading-fill-blanks-dropdown','reading-fill-blanks-drag-drop','reorder-paragraph','respond-to-a-situation'].includes(task))continue;const exercise=await readFile(new URL(`../src/features/${paths[task]}`,import.meta.url),'utf8');assert.match(exercise,/useExercisePersistence/);const builder=task==='reading-fill-blanks-dropdown'?'buildReadingFillBlanksDropdown':task==='reading-fill-blanks-drag-drop'?'buildReadingFillBlanksDragDrop':task==='reorder-paragraph'?'buildReorderParagraph':task==='respond-to-a-situation'?'buildRespondToSituation':`build${task.split('-').map(part=>part[0].toUpperCase()+part.slice(1)).join('')}`;assert.match(exercise,new RegExp(`${builder}Attempt`));assert.match(exercise,new RegExp(`${builder}ErrorRecords`));assert.match(exercise,new RegExp(`${builder}ReviewItems`));}
});
test('new prefixes reserve normal six-digit identities without consuming permanent technical IDs',()=>{
 const registry=initialRegistry();assert.equal(registry.entries.filter(r=>r.kind==='legacy').length,17);assert.equal(registry.entries.filter(r=>r.kind==='technical').length,22);
 assert.deepEqual(simulateIds(registry,wave),['rtl-000001','sgd-000001','di-000001','swt-000001','sst-000001','hiw-000001']);
});
