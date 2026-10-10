import test from 'node:test';
import assert from 'node:assert/strict';
import { database, catalog, now, ra, rs, wfd, seedHistory, history, snapshot } from './helpers/content-db.mjs';
import { planQuestionBankSync } from '../src/domain/content/sync.ts';
import { installItem, isPracticeEligible } from '../src/domain/content/installedContent.ts';
import { ContentSyncError } from '../src/domain/content/syncTypes.ts';
import { syncQuestionBank, initializeQuestionBank, syncGeneratedQuestionBank } from '../src/data/question-bank/syncQuestionBank.ts';
import { verifyQuestionBankCatalog } from '../src/data/question-bank/generatedQuestionBank.ts';
import { db as appDb } from '../src/data/db/database.ts';
import { studyItemsRepository } from '../src/data/repositories/studyItemsRepository.ts';
import { readAloudQuestions } from '../src/data/question-bank/read-aloud.ts';
import { repeatSentenceQuestions } from '../src/data/question-bank/repeat-sentence.ts';
import { writeFromDictationQuestions } from '../src/data/question-bank/write-from-dictation.ts';

const sync = (db, items) => { const { bundle, manifest } = catalog(items); return syncQuestionBank(bundle, manifest, db); };
test('pure planner inserts and preserves input; new createdAt is local installation time', () => {
  const items = [ra, rs, wfd], before = structuredClone(items);
  const plan = planQuestionBankSync([], items, now);
  assert.equal(plan.inserts.length, 3); assert.deepEqual(plan.errors, []); assert.deepEqual(items, before);
  assert.equal(plan.inserts[0].createdAt, now); assert.equal(plan.inserts.every(i => i.catalogAvailable), true);
});
test('equal revision ignores key order, metadata set order, createdAt and presentation alias', () => {
  const old = installItem(rs, now), incoming = Object.fromEntries(Object.entries(rs).reverse());
  incoming.tags = [...rs.tags].reverse(); incoming.skills = [...rs.skills].reverse(); old.audioUrl = '/local-alias'; old.localDiagnostic = 'ignored';
  const plan = planQuestionBankSync([old], [incoming], 'later');
  assert.deepEqual(plan.unchanged, [rs.id]); assert.deepEqual(plan.errors, []); assert.equal(plan.updates.length, 0);
});
for (const [field, value] of [['prompt', 'Changed prompt'], ['difficulty', 3], ['status', 'retired'], ['topic', 'Other topic'], ['chunks', ['tomorrow', 'starts at nine', 'The lecture']]]) {
  test(`same revision with changed ${field} rejects entire plan`, () => {
    const plan = planQuestionBankSync([installItem(rs, now)], [{ ...rs, [field]: value }, ra], now);
    assert.equal(plan.errors[0].code, 'EQUAL_REVISION_CONFLICT');
    for (const field of ['inserts', 'updates', 'restored', 'unavailable']) assert.deepEqual(plan[field], []);
  });
}
test('revision rollback, task-identity changes, corrupt installed revisions and duplicate IDs reject', () => {
  assert.equal(planQuestionBankSync([installItem({ ...ra, revision: 2 }, now)], [ra], now).errors[0].code, 'REVISION_ROLLBACK');
  assert.equal(planQuestionBankSync([{ ...installItem(ra, now), taskType: 'repeat-sentence' }], [ra], now).errors[0].code, 'TASK_IDENTITY_CONFLICT');
  assert.equal(planQuestionBankSync([{ ...installItem(ra, now), revision: 0 }], [ra], now).errors[0].code, 'INVALID_INSTALLED_CONTENT');
  assert.equal(planQuestionBankSync([], [ra, ra], now).errors[0].code, 'DUPLICATE_ID');
});
test('missing catalog item retains lifecycle/revision; reappearance restores without invented revision', () => {
  const old = installItem(ra, now), missing = planQuestionBankSync([old], [rs], now);
  assert.equal(missing.unavailable[0].status, 'active'); assert.equal(missing.unavailable[0].revision, 1);
  assert.equal(missing.unavailable[0].catalogAvailable, false);
  const restored = planQuestionBankSync(missing.unavailable, [ra], now);
  assert.equal(restored.restored[0].catalogAvailable, true); assert.equal(restored.restored[0].createdAt, old.createdAt);
  assert.equal(restored.restored[0].revision, old.revision);
});
test('fresh transactional install persists state, canonical metadata and audio adapter without history', async t => {
  const db = await database(t), result = await sync(db, [ra, rs, wfd]);
  assert.equal(result.status, 'installed'); assert.equal(await db.studyItems.count(), 3);
  assert.equal((await db.studyItems.get(rs.id)).audioUrl, rs.audio.path);
  const state = await db.contentState.get('question-bank'); assert.equal(state.schemaVersion, 1);
  assert.equal(state.contentVersion, catalog([ra, rs, wfd]).manifest.contentVersion); assert.equal(new Date(state.installedAt).toISOString(), state.installedAt);
  for (const table of ['attempts', 'errors', 'reviews', 'studySessions']) assert.equal(await db.table(table).count(), 0);
});
test('same-version no-op reads no item scan and performs no writes', async t => {
  const db = await database(t); await sync(db, [ra]); const before = await snapshot(db);
  db.studyItems.toArray = () => { throw new Error('Unexpected full scan'); };
  db.studyItems.hook('creating', () => { throw new Error('Unexpected insert'); }); db.studyItems.hook('updating', () => { throw new Error('Unexpected update'); });
  db.contentState.hook('updating', () => { throw new Error('Unexpected state write'); });
  assert.equal((await sync(db, [ra])).status, 'unchanged');
  delete db.studyItems.toArray; assert.deepEqual(await snapshot(db), before);
});
test('inserts, newer revisions, retirement, omission and restoration preserve all learner history', async t => {
  const db = await database(t); await seedHistory(db); await sync(db, [ra, rs]);
  const createdAt = (await db.studyItems.get(ra.id)).createdAt;
  await sync(db, [{ ...ra, revision: 2, prompt: 'New wording', status: 'retired' }, wfd]);
  const retired = await db.studyItems.get(ra.id), absent = await db.studyItems.get(rs.id);
  assert.equal(retired.status, 'retired'); assert.equal(retired.catalogAvailable, true); assert.equal(retired.createdAt, createdAt);
  assert.equal(absent.status, 'active'); assert.equal(absent.catalogAvailable, false); assert.equal(absent.revision, 1);
  await sync(db, [{ ...ra, revision: 2, prompt: 'New wording', status: 'retired' }, rs, wfd]);
  assert.equal((await db.studyItems.get(rs.id)).catalogAvailable, true);
  for (const [name, rows] of Object.entries(history)) assert.deepEqual(await db.table(name).toArray(), rows);
  assert.equal('itemRevision' in (await db.attempts.get('a-old')), false);
});
test('equal-revision mutation and rollback leave both installed bank and state byte-for-byte unchanged', async t => {
  const db = await database(t); await seedHistory(db); await sync(db, [{ ...ra, revision: 2 }]); const before = await snapshot(db);
  for (const incoming of [[{ ...ra, revision: 2, prompt: 'Bad mutation' }, rs], [ra]]) {
    await assert.rejects(sync(db, incoming), ContentSyncError); assert.deepEqual(await snapshot(db), before);
  }
});
test('write failure midway through bulk updates rolls back preceding inserts and the state', async t => {
  const db = await database(t), second = { ...rs, id: 'rs-000002' };
  await seedHistory(db); await sync(db, [rs, second]); const before = await snapshot(db);
  db.studyItems.hook('updating', (_changes, id) => { if (id === second.id) throw new Error('Injected write failure'); });
  await assert.rejects(sync(db, [{ ...rs, revision: 2 }, { ...second, revision: 2 }, ra]));
  assert.deepEqual(await snapshot(db), before);
});
test('last content-state write failure rolls back successful item writes', async t => {
  const db = await database(t); await sync(db, [ra]); const before = await snapshot(db);
  db.contentState.hook('updating', () => { throw new Error('Injected state failure'); });
  await assert.rejects(sync(db, [{ ...ra, revision: 2 }, rs])); assert.deepEqual(await snapshot(db), before);
});
test('draft-only generated bank installs separately without retiring legacy rows or entering practice', async t => {
  const db = await database(t), legacy = [...writeFromDictationQuestions, ...repeatSentenceQuestions, ...readAloudQuestions];
  await db.studyItems.bulkAdd(legacy); await syncGeneratedQuestionBank(db);
  const all = await db.studyItems.toArray(); assert.equal(all.length, 20);
  assert.equal(all.filter(isPracticeEligible).length, 17);
  for (const old of legacy) assert.deepEqual(await db.studyItems.get(old.id), old);
  assert.equal(all.filter(i => i.id.endsWith('900001')).every(i => i.status === 'draft' && !isPracticeEligible(i)), true);
});
test('legacy unknown revision adoption preserves timestamp and old attempts without inventing revision', async t => {
  const db = await database(t), legacy = readAloudQuestions[0]; await db.studyItems.add(legacy); await seedHistory(db);
  const authored = { ...ra, id: legacy.id }; await sync(db, [authored]);
  const adopted = await db.studyItems.get(legacy.id); assert.equal(adopted.revision, authored.revision); assert.equal(adopted.createdAt, legacy.createdAt);
  assert.equal((await db.attempts.get('a-old')).itemRevision, undefined); assert.deepEqual(await db.attempts.toArray(), history.attempts);
});
test('startup keeps last valid bank with controlled warning, but fails visibly without one', async t => {
  const db = await database(t), good = catalog([ra]); await sync(db, [ra]);
  const before = await snapshot(db), result = await initializeQuestionBank(good.bundle, { ...good.manifest, itemCount: 99 }, db);
  assert.equal(result.status, 'preserved'); assert.equal(result.warning.code, 'CONTENT_SYNC_FAILED'); assert.deepEqual(await snapshot(db), before);
  const fresh = await database(t); await assert.rejects(initializeQuestionBank({}, {}, fresh), error => error.issues[0].code === 'CONTENT_INITIALIZATION_FAILED');
  const draft = catalog([{ ...ra, status: 'draft' }]); await assert.rejects(initializeQuestionBank(draft.bundle, draft.manifest, fresh), ContentSyncError);
  assert.equal(await fresh.contentState.count(), 0);
});
test('legacy bank is valid fallback; malformed old bank is never accepted as usable', async t => {
  const db = await database(t); await db.studyItems.add(readAloudQuestions[0]);
  assert.equal((await initializeQuestionBank({}, {}, db)).status, 'preserved');
  await db.studyItems.put({ ...readAloudQuestions[0], transcript: '' }); await assert.rejects(initializeQuestionBank({}, {}, db), ContentSyncError);
});
test('browser sanity checks reject wrong counts/schema/hash shape/unknown fields and duplicates', () => {
  const good = catalog([ra, rs]); verifyQuestionBankCatalog(good.bundle, good.manifest);
  for (const changed of [{ ...good.manifest, schemaVersion: 2 }, { ...good.manifest, contentVersion: 'sha256:BAD' }, { ...good.manifest, contentVersion: good.manifest.contentVersion + '\n' }, { ...good.manifest, itemCount: 9 }, { ...good.manifest, audioAssetCount: 9 }, { ...good.manifest, extra: true }, { ...good.manifest, countsByTaskType: {} }]) assert.throws(() => verifyQuestionBankCatalog(good.bundle, changed), ContentSyncError);
  assert.throws(() => verifyQuestionBankCatalog({ ...good.bundle, extra: true }, good.manifest), ContentSyncError);
  assert.throws(() => verifyQuestionBankCatalog({ ...good.bundle, items: [ra, ra] }, good.manifest), ContentSyncError);
});
test('current repository task query excludes drafts/retired/unavailable while preserving all 17 legacy items', async t => {
  t.after(() => appDb.delete()); await appDb.studyItems.bulkPut([...writeFromDictationQuestions, ...repeatSentenceQuestions, ...readAloudQuestions]);
  await syncGeneratedQuestionBank(appDb);
  await appDb.studyItems.bulkAdd([installItem(ra, now), installItem({ ...ra, id: 'ra-000002', status: 'retired' }, now), { ...installItem({ ...ra, id: 'ra-000003' }, now), catalogAvailable: false }]);
  assert.equal((await studyItemsRepository.getByTaskType('read-aloud')).length, 7);
  assert.equal((await studyItemsRepository.getByTaskType('repeat-sentence')).length, 6);
  assert.equal((await studyItemsRepository.getByTaskType('write-from-dictation')).length, 5);
  assert.ok(await studyItemsRepository.getById('ra-900001')); // history/admin can resolve non-practice identities
});
for (const size of [1000, 5000]) {
  test(`${size} synthetic items plan with maps and sync in one transaction`, async t => {
    const db = await database(t), items = Array.from({ length: size }, (_, i) => ({ ...ra, id: 'ra-' + String(i + 1).padStart(6, '0'), prompt: 'Synthetic fixture ' + i }));
    let transactions = 0; db.on('ready', () => {});
    const original = db.transaction.bind(db); db.transaction = (...args) => { transactions++; return original(...args); };
    await sync(db, items); assert.equal(transactions, 1); assert.equal(await db.studyItems.count(), size);
    assert.equal((await sync(db, items)).status, 'unchanged'); assert.equal(transactions, 2);
  });
}
