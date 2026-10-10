import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { database, ra, rs, wfd, now } from './helpers/content-db.mjs';
import { installItem } from '../src/domain/content/installedContent.ts';
import { parseStudyItemQuery, comparePracticeItems } from '../src/domain/content/query.ts';
import { StudyItemQueryError } from '../src/domain/content/queryTypes.ts';
import { sampleStudyItems } from '../src/domain/content/sampling.ts';
import { createStudyItemsRepository } from '../src/data/repositories/studyItemsRepository.ts';
import { readAloudQuestions } from '../src/data/question-bank/read-aloud.ts';
import { repeatSentenceQuestions } from '../src/data/question-bank/repeat-sentence.ts';
import { writeFromDictationQuestions } from '../src/data/question-bank/write-from-dictation.ts';
const rows = [
  installItem({ ...ra, id: 'ra-000003', difficulty: 3, skills: ['reading', 'speaking'], tags: ['academic', 'Science'], topic: 'Research' }, now),
  installItem({ ...rs, id: 'rs-000002', difficulty: 2, tags: ['academic', 'schedule'], topic: 'schedule' }, now),
  installItem({ ...wfd, id: 'wfd-000002', difficulty: 3, skills: ['listening', 'writing'], tags: ['Academic'], topic: 'Research' }, now),
  installItem({ ...rs, id: 'rs-000001', difficulty: 2, skills: ['speaking'], tags: ['academic'], topic: 'Research' }, now),
  installItem({ ...ra, id: 'ra-000001', difficulty: 1, tags: ['academic'], topic: 'Research' }, now),
  installItem({ ...ra, id: 'ra-000002', difficulty: 1, tags: ['general'], topic: 'research' }, now),
  installItem({ ...ra, id: 'ra-900001', status: 'draft' }, now),
  installItem({ ...rs, id: 'rs-900001', status: 'draft' }, now),
  installItem({ ...wfd, id: 'wfd-900001', status: 'draft' }, now),
  installItem({ ...ra, id: 'ra-000004', status: 'retired' }, now),
  { ...installItem({ ...rs, id: 'rs-000004' }, now), catalogAvailable: false },
];
async function setup(t) { const db = await database(t); await db.studyItems.bulkAdd(rows); return { db, repo: createStudyItemsRepository(db) }; }
const ids = items => items.map(i => i.id);
const ordered = ['wfd-000002', 'rs-000001', 'rs-000002', 'ra-000001', 'ra-000002', 'ra-000003'];
for (const [name, query, expected] of [
  ['all eligible', {}, ordered],
  ['one task', { taskTypes: ['repeat-sentence'] }, ['rs-000001', 'rs-000002']],
  ['multiple tasks', { taskTypes: ['read-aloud', 'write-from-dictation'] }, ['wfd-000002', 'ra-000001', 'ra-000002', 'ra-000003']],
  ['one difficulty', { difficulties: [3] }, ['wfd-000002', 'ra-000003']],
  ['multiple difficulties', { difficulties: [3, 2] }, ['wfd-000002', 'rs-000001', 'rs-000002', 'ra-000003']],
  ['skills any default', { skills: ['listening', 'speaking'] }, ordered],
  ['skills all', { skills: ['listening', 'speaking'], matchSkills: 'all' }, ['rs-000002']],
  ['tags any default', { tags: ['academic', 'general'] }, ordered.slice(1)],
  ['tags all', { tags: ['academic', 'schedule'], matchTags: 'all' }, ['rs-000002']],
  ['exact tag case', { tags: ['Academic'] }, ['wfd-000002']],
  ['exact topic', { topic: 'Research' }, ['wfd-000002', 'rs-000001', 'ra-000001', 'ra-000003']],
  ['topic case', { topic: 'research' }, ['ra-000002']],
  ['exclusions', { excludeIds: ['rs-000001', 'ra-000001', 'ra-000099'] }, ['wfd-000002', 'rs-000002', 'ra-000002', 'ra-000003']],
  ['limit after sorting', { limit: 2 }, ordered.slice(0, 2)],
  ['combined', { taskTypes: ['repeat-sentence'], difficulties: [2, 3], skills: ['speaking'], tags: ['academic'], excludeIds: ['rs-000002'], limit: 3 }, ['rs-000001']],
  ['valid no match', { tags: ['not-present'] }, []],
  ['empty exclusions', { excludeIds: [] }, ordered],
]) {
  test(`${name}: query/count parity with eligibility and exact metadata`, async t => {
    const { repo } = await setup(t), before = structuredClone(query);
    assert.deepEqual(ids(await repo.queryPracticeItems(query)), expected); assert.deepEqual(query, before);
    assert.equal(await repo.countPracticeItems(query), name === 'limit after sorting' ? ordered.length : expected.length);
  });
}
for (const key of ['taskTypes', 'difficulties', 'skills', 'tags']) {
  for (const mode of ['any', 'all']) test(`empty ${key} gives no matches (${mode})`, async t => {
    const { db, repo } = await setup(t); db.studyItems.where = () => { throw new Error('Empty query should not touch DB'); };
    const query = { [key]: [], matchSkills: mode, matchTags: mode };
    assert.deepEqual(await repo.queryPracticeItems(query), []); assert.equal(await repo.countPracticeItems(query), 0);
  });
}
test('ordering is independent of insert order; getByTaskType delegates and supports extracted methods', async t => {
  const first = await setup(t), db = await database(t); await db.studyItems.bulkAdd([...rows].reverse());
  const repo = createStudyItemsRepository(db);
  assert.deepEqual(ids(await first.repo.queryPracticeItems()), ids(await repo.queryPracticeItems()));
  const { getByTaskType } = repo; assert.deepEqual(ids(await getByTaskType('repeat-sentence')), ['rs-000001', 'rs-000002']);
  const original = [...rows]; [...rows].sort(comparePracticeItems); assert.deepEqual(rows, original);
});
test('task/difficulty filters use their existing indexes, without a table-wide candidate scan', async t => {
  const { db, repo } = await setup(t), used = [], where = db.studyItems.where.bind(db.studyItems);
  db.studyItems.where = key => { used.push(key); return where(key); };
  db.studyItems.toCollection = () => { throw new Error('Unexpected full scan'); };
  await repo.queryPracticeItems({ taskTypes: ['read-aloud'] });
  await repo.queryPracticeItems({ difficulties: [2] });
  await repo.countPracticeItems({ taskTypes: ['repeat-sentence'], difficulties: [2] });
  assert.deepEqual(used, ['taskType', 'difficulty', 'taskType']);
});
test('historical/admin lookups retain drafts, retired and unavailable identities', async t => {
  const { repo } = await setup(t); assert.equal((await repo.getAll()).length, rows.length);
  for (const id of ['ra-900001', 'ra-000004', 'rs-000004']) assert.equal((await repo.getById(id)).id, id);
  assert.equal((await repo.queryPracticeItems()).some(i => i.id.endsWith('900001')), false);
  assert.deepEqual(await repo.countPracticeItemsByTaskType(), { 'write-from-dictation': 1, 'repeat-sentence': 2, 'read-aloud': 3 });
});
test('17 legacy items match task/difficulty but never inferred metadata; coverage is informational', async t => {
  const { db, repo } = await setup(t); await db.studyItems.bulkAdd([...writeFromDictationQuestions, ...repeatSentenceQuestions, ...readAloudQuestions]);
  assert.equal(await repo.countPracticeItems(), 23);
  const legacyOnly = { excludeIds: ordered }; assert.equal(await repo.countPracticeItems(legacyOnly), 17);
  for (const query of [{ skills: ['speaking'] }, { tags: ['academic'] }, { topic: 'Research' }]) assert.equal((await repo.queryPracticeItems({ ...legacyOnly, ...query })).length, 0);
  assert.equal((await repo.queryPracticeItems({ ...legacyOnly, difficulties: [1] })).length > 0, true);
  assert.deepEqual(await repo.practiceMetadataCoverage(), { eligibleItems: 23, missingSkills: 17, missingTags: 17, missingTopic: 17 });
  assert.deepEqual(await repo.countPracticeItemsByTaskType(), { 'write-from-dictation': 6, 'repeat-sentence': 8, 'read-aloud': 9 });
});
test('zero counts expose all implemented task keys and coverage on empty DB', async t => {
  const repo = createStudyItemsRepository(await database(t));
  assert.deepEqual(await repo.countPracticeItemsByTaskType(), { 'write-from-dictation': 0, 'repeat-sentence': 0, 'read-aloud': 0 });
  assert.deepEqual(await repo.practiceMetadataCoverage(), { eligibleItems: 0, missingSkills: 0, missingTags: 0, missingTopic: 0 });
});
for (const [field, value] of [
  ['taskTypes', ['retell-lecture']], ['taskTypes', ['read-aloud', 'read-aloud']], ['taskTypes', 'read-aloud'],
  ['difficulties', [0]], ['difficulties', [6]], ['difficulties', [2.5]], ['difficulties', ['2']], ['difficulties', [NaN]],
  ['skills', ['math']], ['skills', ['speaking', 'speaking']], ['tags', [1]], ['tags', ['']], ['tags', [' ']], ['tags', ['a', 'a']],
  ['tags', ['x'.repeat(101)]], ['tags', Array.from({ length: 51 }, (_, i) => String(i))],
  ['topic', 2], ['topic', ''], ['topic', ' '], ['topic', 'x'.repeat(201)],
  ['excludeIds', [null]], ['excludeIds', ['rs-007']], ['excludeIds', ['ra-000000']], ['excludeIds', ['ra-000001\n']],
  ['excludeIds', ['../bad']], ['excludeIds', ['ra-000001', 'ra-000001']],
  ['matchSkills', 'ANY'], ['matchTags', 'none'], ['matchTags', undefined],
  ['limit', 0], ['limit', -1], ['limit', 501], ['limit', 1.5], ['limit', '2'], ['limit', NaN], ['limit', Infinity], ['limit', Number.MAX_SAFE_INTEGER + 1],
]) test(`invalid ${field} ${JSON.stringify(value)} rejects with actionable path`, async t => {
  assert.throws(() => parseStudyItemQuery({ [field]: value }), e => e instanceof StudyItemQueryError && e.issues.some(i => i.path.startsWith(field)));
  const { repo } = await setup(t); await assert.rejects(repo.queryPracticeItems({ [field]: value }), StudyItemQueryError);
  await assert.rejects(repo.countPracticeItems({ [field]: value }), StudyItemQueryError);
});
test('parser rejects nonobjects, unknown fields, accessors, sparse/extra arrays and explicit undefined', () => {
  const getter = {}; Object.defineProperty(getter, 'topic', { enumerable: true, get() { throw new Error('Getter invoked'); } });
  const extra = ['academic']; extra.extra = true;
  for (const input of [null, [], 1, 'query', { taskType: 'read-aloud' }, { skills: undefined }, { tags: Array(1) }, { tags: extra }, getter]) assert.throws(() => parseStudyItemQuery(input), StudyItemQueryError);
});
test('parser preserves exact authored strings/order and copies frozen arrays without mutating input', () => {
  const input = { tags: ['Academic', 'academic'], topic: ' Research ', difficulties: [3, 2], excludeIds: ['ra-001', 'ra-900001'] }, before = structuredClone(input);
  const parsed = parseStudyItemQuery(input); assert.deepEqual(input, before); assert.equal(parsed.topic, input.topic);
  assert.deepEqual(parsed.tags, input.tags); assert.notEqual(parsed.tags, input.tags); assert.ok(Object.isFrozen(parsed.tags));
  assert.equal(parsed.matchSkills, 'any'); assert.equal(parsed.matchTags, 'any'); assert.equal(parseStudyItemQuery({ limit: 500 }).limit, 500);
});
test('deterministic sampling uses injected RNG, unique IDs and leaves input unchanged', () => {
  const input = rows.slice(0, 6), before = structuredClone(input);
  assert.deepEqual(ids(sampleStudyItems(input, 3, () => 0)), ids(input.slice(0, 3)));
  assert.deepEqual(ids(sampleStudyItems(input, 3, () => 0.5)), ids(sampleStudyItems(input, 3, () => 0.5)));
  assert.equal(new Set(ids(sampleStudyItems(input, 6, () => 0.999))).size, 6); assert.deepEqual(input, before);
  assert.deepEqual(sampleStudyItems(input, 0, () => { throw new Error('Unused RNG'); }), []);
  assert.deepEqual(sampleStudyItems([], 0, () => 0), []);
});
test('sampling rejects invalid count, duplicate candidates and invalid RNG values', () => {
  for (const count of [-1, 0.5, NaN, Infinity, 7]) assert.throws(() => sampleStudyItems(rows.slice(0, 6), count, () => 0), RangeError);
  for (const random of [-1, 1, NaN, Infinity, '0']) assert.throws(() => sampleStudyItems(rows, 1, () => random), RangeError);
  assert.throws(() => sampleStudyItems([rows[0], rows[0]], 1, () => 0)); assert.throws(() => sampleStudyItems(rows, 1, undefined), TypeError);
});
for (const size of [1000, 5000]) test(`synthetic ${size}: indexed queries, combined metadata, counts and sample timing`, async t => {
  const db = await database(t), repo = createStudyItemsRepository(db);
  const items = Array.from({ length: size }, (_, i) => {
    const base = [wfd, rs, ra][i % 3]; const prefix = ['wfd', 'rs', 'ra'][i % 3];
    return installItem({ ...base, id: prefix + '-' + String(i + 1).padStart(6, '0'), difficulty: i % 5 + 1,
      tags: i % 2 ? ['academic', 'schedule'] : ['general'], topic: i % 2 ? 'schedule' : 'research' }, now);
  });
  await db.studyItems.bulkAdd(items); const timings = {};
  async function measure(name, fn) { const start = performance.now(); const value = await fn(); timings[name] = Number((performance.now() - start).toFixed(3)); return value; }
  const task = await measure('taskQueryMs', () => repo.queryPracticeItems({ taskTypes: ['repeat-sentence'], limit: 100 }));
  const difficulty = await measure('difficultyQueryMs', () => repo.queryPracticeItems({ difficulties: [2], limit: 100 }));
  const query = { taskTypes: ['repeat-sentence'], difficulties: [2, 3], skills: ['listening', 'speaking'], matchSkills: 'all', tags: ['academic'], topic: 'schedule', limit: 20 };
  const combined = await measure('combinedQueryMs', () => repo.queryPracticeItems(query));
  const count = await measure('countMs', () => repo.countPracticeItems(query));
  const selected = await measure('samplingMs', () => sampleStudyItems(task, 10, () => 0.25));
  assert.equal(task.length, 100); assert.equal(difficulty.length, 100); assert.equal(combined.length, Math.min(count, 20));
  assert.equal(selected.length, 10); assert.equal(db.verno, 3); assert.equal(await repo.countPracticeItems(), size);
  t.diagnostic(JSON.stringify({ size, environment: 'fake-indexeddb; not browser performance evidence', matches: count, timings }));
});
