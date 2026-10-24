import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WAVE1_TASKS, TASK_REGISTRY } from '../src/domain/pte/taskRegistry.ts';
import { parseQuestionBankItem, safeParseQuestionBankItem, validateQuestionBankItems } from '../src/domain/content/validation.ts';
import { TASK_DATA_RULES } from '../src/domain/content/taskDataPolicy.ts';
import { readTaskData, parseTaskData } from '../src/domain/content/taskDataValidation.ts';
import { canonicalBundle, canonicalItem, jsonBytes } from '../tools/content/canonicalize.mjs';
import { manifestFor } from '../tools/content/manifest.mjs';
import { verifyBytes } from '../tools/content/verify.mjs';
import { installItem, isPracticeEligible } from '../src/domain/content/installedContent.ts';
import { createStudyItemsRepository } from '../src/data/repositories/studyItemsRepository.ts';
import { generatedQuestionBank } from '../src/data/question-bank/generatedQuestionBank.ts';
import { bootstrapApp } from '../src/app/bootstrap.ts';
import { database, seedHistory, snapshot, now, catalog } from './helpers/content-db.mjs';
import { initializeQuestionBank } from '../src/data/question-bank/syncQuestionBank.ts';
import { authorRoot } from './helpers/content-authoring.mjs';
import { newItem } from '../tools/content/new-item.mjs';
import { readRegistry } from '../tools/content/ids.mjs';
import { parseInput, importRecords } from '../tools/content/import.mjs';
import { mapRecord } from '../tools/content/import-map.mjs';
import { parseCsv } from '../tools/content/import-csv.mjs';
import { validateAudioAssets } from '../tools/content/audio-integrity.mjs';
import { prepareBank } from '../tools/content/pipeline.mjs';
const prefixes=['rtl','sgd','di','swt','sst','hiw'];
const fixtures=await Promise.all(prefixes.map(prefix=>readFile(`tests/fixtures/wave1/${prefix}-900001.json`,'utf8').then(JSON.parse)));
const bad=input=>assert.equal(safeParseQuestionBankItem(input).success,false);
for(const [index,task]of WAVE1_TASKS.entries()){
 const fixture=fixtures[index];
 test(`${task}: valid draft/publication, typed read, canonical ordering and input immutability`,()=>{
  const before=structuredClone(fixture),parsed=parseQuestionBankItem(fixture);assert.deepEqual(parsed,fixture);assert.deepEqual(fixture,before);assert.ok(Object.isFrozen(parsed.taskData));
  assert.deepEqual(readTaskData({...parsed,createdAt:now},task),fixture.taskData);assert.throws(()=>readTaskData({...parsed,createdAt:now},task==='retell-lecture'?'describe-image':'retell-lecture'));
  const published=structuredClone(fixture);published.status='active';published.skills=TASK_REGISTRY[task].skills;if(published.taskData.audio)published.taskData.audio.sha256='a'.repeat(64);assert.ok(parseQuestionBankItem(published));
  const reordered={...fixture,taskData:Object.fromEntries(Object.entries(fixture.taskData).reverse())};assert.deepEqual(canonicalItem(parsed),canonicalItem(parseQuestionBankItem(reordered)));
 });
 for(const field of TASK_DATA_RULES[task].required)test(`${task}: missing required ${field}`,()=>{const value=structuredClone(fixture);delete value.taskData[field];bad(value);});
 test(`${task}: wrong shape, nested unknown fields, forbidden legacy fields and unsafe asset syntax`,()=>{
  for(const value of [null,[],3,'text'])bad({...fixture,taskData:value});bad({...fixture,taskData:{...fixture.taskData,unknown:true}});bad({...fixture,audioUrl:'/audio/no.mp3'});bad({...fixture,answer:'Not an exact-match task.'});
  const value=structuredClone(fixture),asset=value.taskData.audio??value.taskData.image;
  if(asset){for(const path of ['https://example.test/a.mp3','//host/a','/audio/../bad','C:\\a','/images/a.png?x=1']){const v=structuredClone(fixture);(v.taskData.audio??v.taskData.image).path=path;bad(v);}}
  else{value.taskData.passage=1;bad(value);}
 });
 test(`${task}: incomplete draft can omit payload; published/retired cannot`,()=>{
  const draft={...fixture};delete draft.taskData;assert.ok(parseQuestionBankItem(draft));bad({...draft,status:'active',skills:TASK_REGISTRY[task].skills});bad({...draft,status:'retired',skills:TASK_REGISTRY[task].skills});
 });
}
test('SGD unique three-speaker identity, references and speaker participation',()=>{
 for(const change of [d=>d.speakers[1].id=d.speakers[0].id,d=>d.turns[0].speakerId='unknown',d=>d.speakers.pop(),d=>d.turns[2].speakerId='1']){const f=structuredClone(fixtures[1]);change(f.taskData);bad(f);}
 for(const change of [d=>d.speakerPoints.pop(),d=>d.speakerPoints[1].speakerId=d.speakerPoints[0].speakerId,d=>d.speakerPoints[0].speakerId='unknown']){const f=structuredClone(fixtures[1]);change(f.taskData);bad(f);}
 const active=structuredClone(fixtures[1]);active.status='active';active.skills=TASK_REGISTRY[active.taskType].skills;active.taskData.audio.sha256='a'.repeat(64);delete active.taskData.speakerPoints;bad(active);
});
test('image metadata hash/size/dimensions/MIME and alt/features are mandatory and bounded',()=>{
 for(const change of [i=>i.width=0,i=>i.height=Infinity,i=>i.bytes=0,i=>i.bytes=20*1024*1024+1,i=>i.sha256='A'.repeat(64),i=>i.mediaType='image/jpeg',i=>i.unknown=true]){const f=structuredClone(fixtures[2]);change(f.taskData.image);bad(f);}
 bad({...fixtures[2],taskData:{...fixtures[2].taskData,imageAlt:'   '}});bad({...fixtures[2],taskData:{...fixtures[2].taskData,keyFeatures:[]}});
});
test('Retell Lecture optional image requires task-specific authored alt text',()=>{
 const payload=structuredClone(fixtures[0].taskData);payload.audio.sha256='a'.repeat(64);payload.image={path:'/images/retell.png',sha256:'a'.repeat(64),bytes:100,mediaType:'image/png',width:10,height:10};
 assert.throws(()=>parseTaskData('retell-lecture',payload,true),e=>e.issues[0].path==='taskData.imageAlt');
 payload.imageAlt='NASA thermal image showing a city heat pattern';assert.equal(parseTaskData('retell-lecture',payload,true).imageAlt,payload.imageAlt);
 delete payload.image;assert.throws(()=>parseTaskData('retell-lecture',payload,true),e=>e.issues[0].path==='taskData.imageAlt');
});
test('HIW stable token IDs, incorrect truth, replacement and exact spoken transcript coherence',()=>{
 for(const change of [d=>d.displayedTokens[1].id=d.displayedTokens[0].id,d=>d.displayedTokens.forEach(t=>t.incorrect=false),d=>delete d.displayedTokens[1].spokenText,d=>d.displayedTokens[1].spokenText='seminar',d=>d.displayedTokens[0].spokenText='Other',d=>d.spokenTranscript+=' mismatch',d=>d.displayedTokens[0].text='two words',d=>d.displayedTokens[0].incorrect='true']){const f=structuredClone(fixtures[5]);change(f.taskData);bad(f);}
});
test('payloads reject accessors, prototype objects and non-JSON arrays without invoking getters',()=>{
 const f=structuredClone(fixtures[0]);Object.defineProperty(f.taskData,'transcript',{enumerable:true,get(){throw new Error('getter invoked');}});bad(f);
 bad({...fixtures[0],taskData:new Date()});const value=structuredClone(fixtures[0]);value.taskData.keyPoints=new Array(1);bad(value);
});
test('unfinished-only catalog cannot initialize practice; a previous bank is preserved',async t=>{
 const db=await database(t),item=structuredClone(fixtures[4]);item.status='active';item.skills=['listening','writing'];item.taskData.audio.sha256='a'.repeat(64);const next=catalog([item]);
 await assert.rejects(initializeQuestionBank(next.bundle,next.manifest,db),e=>e.issues.some(i=>i.code==='CONTENT_INITIALIZATION_FAILED'));
 await bootstrapApp(db);const before=await snapshot(db);assert.equal((await initializeQuestionBank(next.bundle,next.manifest,db)).status,'preserved');assert.deepEqual(await snapshot(db),before);
});
test('unfinished Wave 1 installed rows remain historical only, absent from practice/counts',async t=>{
 const db=await database(t),repo=createStudyItemsRepository(db);
 for(const f of fixtures.slice(1).filter(f=>!TASK_REGISTRY[f.taskType].practiceReady)){const value=structuredClone(f);value.status='active';value.skills=TASK_REGISTRY[value.taskType].skills;if(value.taskData.audio)value.taskData.audio.sha256='a'.repeat(64);const item=installItem(parseQuestionBankItem(value),now);assert.equal(isPracticeEligible(item),false);await db.studyItems.add(item);assert.equal((await repo.getById(item.id)).id,item.id);}
 assert.deepEqual(await repo.queryPracticeItems(),[]);assert.equal(await repo.countPracticeItems(),0);
});
test('nested audio metadata counts/warnings use the canonical asset helper',()=>{
 const a=structuredClone(fixtures[0]),b=structuredClone(fixtures[4]);for(const f of [a,b]){f.status='active';f.skills=TASK_REGISTRY[f.taskType].skills;f.taskData.audio.sha256='a'.repeat(64);}
 const parsed=validateQuestionBankItems([a,b]);assert.ok(parsed.success);assert.ok(parsed.warnings.some(w=>w.code==='DUPLICATE_AUDIO_PATH'&&w.path.endsWith('taskData.audio.path')));
 const bundle=canonicalBundle(parsed.items);assert.equal(manifestFor(bundle,jsonBytes(bundle)).audioAssetCount,1);
});
test('nested audio and image remain subject to real file existence checks',async t=>{
 const audio=await validateAudioAssets([fixtures[0]],{audioRoot:'/nonexistent',reportOrphans:false});assert.ok(audio.errors.some(e=>e.code==='AUDIO_NOT_FOUND'&&e.path==='taskData.audio'));
 const root=await authorRoot(t);const image=fixtures[2];await writeFile(join(root,image.taskType,image.id+'.json'),JSON.stringify(image));await assert.rejects(prepareBank({sourceRoot:root}),e=>e.errors.some(e=>e.code==='IMAGE_NOT_FOUND'));
});
test('published Summarize Written Text passages are original bounded reading items with authored key points',async()=>{
 const items=await Promise.all([1,2,3,4].map(i=>readFile(`content/summarize-written-text/swt-00000${i}.json`,'utf8').then(JSON.parse)));
 assert.deepEqual(items.map(i=>i.id),['swt-000001','swt-000002','swt-000003','swt-000004']);
 for(const item of items){assert.equal(item.status,'active');assert.equal(item.source,'internal');assert.deepEqual(item.skills,['reading','writing']);assert.ok(item.taskData.passage.trim().split(/\s+/u).length>=180);assert.ok(item.taskData.passage.trim().split(/\s+/u).length<=300);assert.ok(item.taskData.keyPoints.length>=3&&item.taskData.keyPoints.length<=6);assert.ok(item.taskData.referenceSummary);}
});
test('JSON/CSV taskData mapping preserves nested author text and rejects unknown nested intent',()=>{
 const fixture=fixtures[3],csv='taskType,difficulty,prompt,taskData\n'+['summarize-written-text','2','Draft prompt',JSON.stringify(fixture.taskData)].map(v=>'"'+v.replaceAll('"','""')+'"').join(',');
 const mapped=mapRecord(parseCsv(csv)[0],{format:'csv',source:'internal',allocateIds:true});assert.deepEqual(mapped.taskData,fixture.taskData);assert.equal(mapped.status,'draft');
 assert.equal(parseInput(JSON.stringify(fixture),'json').length,1);assert.throws(()=>mapRecord({taskData:'[]'},{format:'csv',source:'internal',allocateIds:true}));
});
test('new-item supports Wave 1 draft reservation; bulk JSON import stays draft-only and never publishes',async t=>{
 const root=await authorRoot(t);const created=await newItem('retell-lecture',{root});assert.equal(created.id,'rtl-000001');assert.equal(JSON.parse(await readFile(join(root,'retell-lecture/rtl-000001.json'))).taskData,undefined);
 const source=structuredClone(fixtures[3]);delete source.id;const before=await readRegistry(root);
 const result=await importRecords([source],{root,source:'internal',allocateIds:true,dryRun:true});assert.deepEqual(result.simulatedIds,['swt-000001']);assert.deepEqual(await readRegistry(root),before);
 const written=await importRecords([source],{root,source:'internal',allocateIds:true});assert.equal(written.createdDrafts,1);assert.equal(parseQuestionBankItem(JSON.parse(await readFile(join(root,'summarize-written-text/swt-000001.json')))).status,'draft');
});
test('schema v1 installed content upgrades only catalog state: semantic rows and learner history unchanged',async t=>{
 const db=await database(t);await bootstrapApp(db);await seedHistory(db);const before=await snapshot(db);
 await db.contentState.put({...before.contentState[0],schemaVersion:1,contentVersion:'sha256:bd666658b8e96465a676daf4881e8bb7c8322a1165b11fd14936e873a6b837c2'});
 const result=await bootstrapApp(db);assert.equal(result.status,'installed');assert.equal(result.plan.updates.length,0);assert.equal(result.plan.unchanged.length,32);const after=await snapshot(db);
 for(const table of ['studyItems','attempts','errors','reviews','studySessions'])assert.deepEqual(after[table],before[table]);assert.equal(after.contentState[0].schemaVersion,2);assert.equal(db.verno,3);assert.equal(after.attempts[0].itemRevision,undefined);assert.equal((await bootstrapApp(db)).status,'unchanged');
});
test('legacy generated pair is verified only for atomic replacement/recovery, never current publication',()=>{
 const {bundle}=generatedQuestionBank();const legacy={...canonicalBundle(bundle.items.filter(item=>!WAVE1_TASKS.includes(item.taskType))),schemaVersion:1};const bytes=jsonBytes(legacy),manifest=manifestFor(legacy,bytes);for(const task of WAVE1_TASKS)delete manifest.countsByTaskType[task];
 assert.throws(()=>verifyBytes(bytes,jsonBytes(manifest)));assert.equal(verifyBytes(bytes,jsonBytes(manifest),{allowPreviousSchema:true}).bundle.schemaVersion,1);
});
