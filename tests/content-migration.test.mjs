import { taskRecord } from '../src/domain/pte/taskRegistry.ts';
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import Dexie from 'dexie';
import { readFile } from 'node:fs/promises';
import { database, seedHistory, history, snapshot, catalog as makeCatalog } from './helpers/content-db.mjs';
import { readAloudQuestions, repeatSentenceQuestions, writeFromDictationQuestions } from './helpers/legacy-question-bank.mjs';
import { bootstrapApp } from '../src/app/bootstrap.ts';
import { PteDatabase } from '../src/data/db/database.ts';
import { generatedQuestionBank } from '../src/data/question-bank/generatedQuestionBank.ts';
import { isPracticeEligible } from '../src/domain/content/installedContent.ts';
import { initializeQuestionBank, syncQuestionBank } from '../src/data/question-bank/syncQuestionBank.ts';
const legacy = [...writeFromDictationQuestions, ...repeatSentenceQuestions, ...readAloudQuestions];
const catalog = generatedQuestionBank();
test('all 17 published canonical items retain every semantic legacy field exactly', async () => {
  assert.equal(catalog.bundle.items.length, 17);
  for (const old of legacy) {
    const item = catalog.bundle.items.find(i => i.id === old.id);
    for (const key of ['id','taskType','difficulty','prompt','answer','transcript','chunks','phraseGroups','stressWords']) assert.deepEqual(item[key], old[key], old.id + '.' + key);
    assert.equal(item.audio?.path, old.audioUrl);
    assert.equal(item.status, 'active'); assert.equal(item.source, 'internal'); assert.equal(item.revision, 1);
    if (item.audio) { assert.match(item.audio.sha256, /^[a-f0-9]{64}$/); assert.ok(item.audio.durationMs > 0); }
    const authored = JSON.parse(await readFile(`content/${item.taskType}/${item.id}.json`, 'utf8')); assert.equal(authored.id, old.id);
  }
  assert.deepEqual(catalog.manifest.countsByTaskType, { ...taskRecord(()=>0), 'write-from-dictation':5,'repeat-sentence':6,'read-aloud':6 });
  assert.equal(catalog.bundle.items.some(i => i.id.endsWith('900001')), false);
});
test('fresh bootstrap installs exactly 17 eligible rows; repeated bootstrap writes nothing', async t => {
  const db = await database(t); assert.equal((await bootstrapApp(db)).status, 'installed');
  assert.equal((await db.studyItems.toArray()).filter(isPracticeEligible).length, 17);
  const before = await snapshot(db); assert.equal((await bootstrapApp(db)).status, 'unchanged'); assert.deepEqual(await snapshot(db), before);
  assert.equal(await db.attempts.count(), 0);
  assert.equal((await db.contentState.get('question-bank')).contentVersion, catalog.manifest.contentVersion);
});
for (const version of [2,3]) test(`v${version} legacy catalog upgrades preserving all history and original timestamps`, async t => {
  const name = 'migration-' + crypto.randomUUID(), old = new Dexie(name);
  old.version(2).stores({settings:'key',studyItems:'id, taskType, difficulty',attempts:'id, itemId, taskType, createdAt',errors:'id, attemptId, itemId, taskType, category, createdAt',reviews:'id, sourceAttemptId, sourceErrorId, dueAt',studySessions:'id, startedAt'});
  if(version===3)old.version(3).stores({contentState:'key'});
  await old.open(); await old.table('studyItems').bulkAdd(legacy); await seedHistory(old); old.close();
  const db = new PteDatabase(name); t.after(()=>db.delete()); await db.open(); await bootstrapApp(db);
  for(const oldItem of legacy){const row=await db.studyItems.get(oldItem.id);assert.equal(row.revision,1);assert.equal(row.createdAt,oldItem.createdAt);assert.equal(row.catalogAvailable,true);}
  for(const [table,rows]of Object.entries(history))assert.deepEqual(await db.table(table).toArray(),rows);
  assert.equal((await db.attempts.get('a-old')).itemRevision,undefined);
  const before=await snapshot(db);assert.equal((await initializeQuestionBank({}, {}, db)).status,'preserved');assert.deepEqual(await snapshot(db),before);
});

test('previously installed technical drafts remain historical unavailable rows, never practice', async t => {
 const db = await database(t), technical = [];
 for(const [task,prefix]of [['write-from-dictation','wfd'],['repeat-sentence','rs'],['read-aloud','ra']]) technical.push(JSON.parse(await readFile(`content/examples/technical/${task}/${prefix}-900001.json`,'utf8')));
 const previous = makeCatalog(technical);await db.studyItems.bulkAdd(legacy);await syncQuestionBank(previous.bundle,previous.manifest,db);await bootstrapApp(db);
 const all=await db.studyItems.toArray();assert.equal(all.length,20);assert.equal(all.filter(isPracticeEligible).length,17);
 for(const item of technical){const row=await db.studyItems.get(item.id);assert.equal(row.status,'draft');assert.equal(row.catalogAvailable,false);assert.equal(isPracticeEligible(row),false);}
});
