import test from 'node:test';
import assert from 'node:assert/strict';
import { now, history, seedHistory, snapshot, catalog, ra } from './helpers/content-db.mjs';
import Dexie from 'dexie';
import { PteDatabase } from '../src/data/db/database.ts';
import { readAloudQuestions } from '../src/data/question-bank/read-aloud.ts';
import { syncQuestionBank } from '../src/data/question-bank/syncQuestionBank.ts';

test('real Dexie v2→v3 upgrade adds only contentState and preserves every legacy row/index/history', async t => {
  const name = 'upgrade-test-' + crypto.randomUUID(), old = new Dexie(name);
  old.version(1).stores({ settings: 'key' });
  old.version(2).stores({ settings: 'key', studyItems: 'id, taskType, difficulty', attempts: 'id, itemId, taskType, createdAt', errors: 'id, attemptId, itemId, taskType, category, createdAt', reviews: 'id, sourceAttemptId, sourceErrorId, dueAt', studySessions: 'id, startedAt' });
  await old.open(); await old.table('studyItems').bulkAdd(readAloudQuestions); await seedHistory(old);
  await old.table('settings').put({ key: 'theme', value: { preserved: true, date: now } });
  const before = await snapshot(old); old.close();
  const next = new PteDatabase(name); t.after(() => next.delete()); await next.open();
  assert.equal(next.verno, 3); const after = await snapshot(next); assert.deepEqual(after.contentState, []); delete after.contentState; assert.deepEqual(after, before);
  for (const item of await next.studyItems.toArray()) { assert.equal('revision' in item, false); assert.equal('status' in item, false); assert.equal('catalogAvailable' in item, false); }
  assert.deepEqual(next.studyItems.schema.indexes.map(i => i.name), ['taskType', 'difficulty']);
  const incoming = catalog([{ ...ra, id: 'ra-001' }]); await syncQuestionBank(incoming.bundle, incoming.manifest, next);
  assert.equal((await next.studyItems.get('ra-001')).revision, 1);
  for (const [name, rows] of Object.entries(history)) assert.deepEqual(await next.table(name).toArray(), rows);
  assert.equal((await next.attempts.get('a-old')).itemRevision, undefined);
});
