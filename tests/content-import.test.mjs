import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, mkdir, readdir, link, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { parseCsv } from '../tools/content/import-csv.mjs';
import { mapRecord, validateImportRecords } from '../tools/content/import-map.mjs';
import { parseInput, importRecords, importFile } from '../tools/content/import.mjs';
import { readRegistry, simulateIds, initialRegistry } from '../tools/content/ids.mjs';
import { recoverAuthorStage } from '../tools/content/author-install.mjs';
import { buildBank } from '../tools/content/build.mjs';
import { canonicalItem, jsonBytes } from '../tools/content/canonicalize.mjs';
import { authorRoot, record, rejectsAuthor, snapshot } from './helpers/content-authoring.mjs';
const options = root => ({ root, source: 'internal', allocateIds: true });

test('CSV preserves commas, escaped quotes, CRLF/newlines and Unicode exactly', () => {
  const text = 'taskType,difficulty,prompt\r\nread-aloud,2,"  café, Ω ""quoted""\r\nsecond line  "\r\n';
  const rows = parseCsv(text); assert.equal(rows[0].prompt, '  café, Ω "quoted"\r\nsecond line  ');
  assert.equal(rows[0].difficulty, '2');
});
for (const text of ['a,a\nx,y\n', 'taskType,prompt\nra,"unclosed', 'prompt\n"quoted"tail', 'prompt\nnot"quoted', 'prompt\nhello\rbye', '\ufeffprompt\nhello', 'taskType,prompt\nra', 'prompt\nhello,extra', ''])
  test(`invalid CSV: ${JSON.stringify(text)}`, () => assert.throws(() => parseCsv(text), e => e.issues[0].code === 'IMPORT_INVALID_CSV'));
test('CSV rejects unknown headers without guessing aliases', () => {
  assert.throws(() => parseCsv('taskType,dificulty\nread-aloud,2'), e => e.issues[0].code === 'IMPORT_UNKNOWN_COLUMN');
  assert.throws(() => parseCsv('taskType, difficulty\nread-aloud,2'), e => e.issues[0].code === 'IMPORT_UNKNOWN_COLUMN');
});
test('CSV arrays use JSON and audio metadata has explicit mapping', () => {
  const mapped = mapRecord({ taskType: 'repeat-sentence', difficulty: '2', prompt: 'Listen.', chunks: '["a","b"]', skills: '["speaking"]', audioPath: '/audio/rs/test.mp3', audioDurationMs: '3000', audioMimeType: 'audio/mpeg', estimatedSeconds: '3.5' }, { format: 'csv', source: 'internal', allocateIds: true });
  assert.deepEqual(mapped.audio, { path: '/audio/rs/test.mp3', durationMs: 3000, mimeType: 'audio/mpeg' });
  assert.deepEqual(mapped.chunks, ['a', 'b']); assert.equal(mapped.estimatedSeconds, 3.5); assert.equal(mapped.difficulty, 2);
});
for (const cell of ['one|two', '{}', 'null', '["unterminated]']) test(`invalid array cell ${cell}`, () => {
  assert.throws(() => mapRecord({ ...record(), tags: cell }, { format: 'csv', source: 'generated', allocateIds: true }), e => e.issues[0].code === 'IMPORT_INVALID_ARRAY_CELL');
});
test('metadata without audioPath is rejected', () => {
  assert.throws(() => mapRecord({ ...record(), audioSha256: 'a'.repeat(64) }, { format: 'csv', source: 'internal' }), e => e.issues[0].code === 'IMPORT_MAPPING_FAILED');
});
for (const value of ['2.5', '0', '6', 'two', ' 2', 'NaN', 'Infinity']) test(`CSV difficulty rejects ${value}`, async t => {
  const root = await authorRoot(t), before = await snapshot(root);
  await assert.rejects(importRecords([{ taskType: 'read-aloud', difficulty: value, prompt: 'Read.' }], { ...options(root), format: 'csv' }));
  assert.deepEqual(await snapshot(root), before);
});
test('JSON supports single object and arrays; duplicate keys and malformed input reject', () => {
  assert.equal(parseInput(JSON.stringify(record()), 'json').length, 1);
  assert.equal(parseInput(JSON.stringify([record(), record()]), 'json').length, 2);
  for (const input of ['{', '{"id":"ra-000001","id":"ra-000002"}', '[{"taskType":"read-aloud","taskType":"repeat-sentence"}]']) assert.throws(() => parseInput(input, 'json'));
  assert.throws(() => parseInput('[]', 'json')); assert.throws(() => parseInput('null', 'json') && mapRecord(null, { source: 'internal', format: 'json' }));
});
for (const [label, row, code] of [
  ['active', record({ status: 'active' }), 'IMPORT_PUBLISHED_FORBIDDEN'],
  ['retired', record({ status: 'retired' }), 'IMPORT_PUBLISHED_FORBIDDEN'],
  ['unknown field', record({ audioUrl: '/audio/a.mp3' }), 'IMPORT_UNKNOWN_COLUMN'],
  ['source mismatch', record({ source: 'licensed' }), 'IMPORT_MAPPING_FAILED'],
  ['allocate with ID', record({ id: 'ra-000001' }), 'IMPORT_MAPPING_FAILED'],
  ['null revision', record({ revision: null }), 'INVALID_REVISION'],
  ['answer mismatch', record({ answer: 'a', transcript: 'b' }), 'ANSWER_TRANSCRIPT_MISMATCH'],
]) test(`import rejects ${label} without reserving anything`, async t => {
  const root = await authorRoot(t), before = await snapshot(root);
  await rejectsAuthor(() => importRecords([row], options(root)), code); assert.deepEqual(await snapshot(root), before);
});
test('external import requires explicit provenance even if input declares source', async t => {
  const root = await authorRoot(t);
  await rejectsAuthor(() => importRecords([record({ source: 'internal' })], { root, allocateIds: true }), 'IMPORT_SOURCE_REQUIRED');
});
test('preserve-ID mode is explicit and duplicate input IDs are hard errors', async t => {
  const root = await authorRoot(t), row = record({ id: 'ra-000100' });
  await rejectsAuthor(() => importRecords([row, row], { root, source: 'internal' }), 'IMPORT_DUPLICATE_ID');
  const result = await importRecords([row], { root, source: 'internal' });
  assert.deepEqual(result.itemIds, ['ra-000100']);
  await rejectsAuthor(() => importRecords([row], { root, source: 'internal' }), 'IMPORT_EXISTING_ID');
});
test('short historical IDs and technical IDs cannot be imported as new content', async t => {
  const root = await authorRoot(t);
  await rejectsAuthor(() => importRecords([record({ id: 'ra-001' })], { root, source: 'internal' }), 'IMPORT_EXISTING_ID');
  await rejectsAuthor(() => importRecords([record({ id: 'ra-900002' })], { root, source: 'internal' }), 'ID_TECHNICAL_RANGE');
});
test('dry-run previews advisory IDs without locks, files, history or reservations', async t => {
  const root = await authorRoot(t), before = await snapshot(root);
  const result = await importRecords([record(), record({ taskType: 'repeat-sentence' })], { ...options(root), dryRun: true });
  assert.deepEqual(result.simulatedIds, ['ra-000001', 'rs-000001']); assert.equal(result.reservedIds, 0); assert.equal(result.createdDrafts, 0);
  assert.deepEqual(await snapshot(root), before);
});
test('JSON and CSV fixtures install canonical drafts with preserved wording and safe provenance history', async t => {
  const root = await authorRoot(t);
  await importFile('tests/fixtures/import/drafts.json', options(root));
  const result = await importFile('tests/fixtures/import/drafts.csv', { ...options(root), source: 'generated', note: 'Synthetic internal authoring fixture; no learner data.' });
  const rs = JSON.parse(await readFile(join(root, 'repeat-sentence/rs-000002.json'), 'utf8'));
  assert.equal(rs.prompt, 'Listen, then repeat.'); assert.deepEqual(rs.chunks, ['The lecture', 'starts tomorrow']); assert.equal(rs.status, 'draft'); assert.equal(rs.source, 'generated');
  const history = JSON.parse(await readFile(join(root, 'import-history', result.batchId + '.json'), 'utf8'));
  assert.equal(history.inputFilename, 'drafts.csv'); assert.deepEqual(history.itemIds, result.itemIds);
  assert.equal(JSON.stringify(history).includes(root), false);
  const built = await buildBank({ sourceRoot: root, outputRoot: join(root, 'generated'), enforceRegistry: true });
  assert.equal(built.manifest.itemCount, 4); assert.equal(built.bundle.items.every(item => item.status === 'draft'), true);
});
test('authored semantic strings and arrays are never corrected or normalized', async t => {
  const root = await authorRoot(t), row = record({ prompt: '  Café e\u0301 — Colour!\n ', answer: 'Nine, not 9.', transcript: 'Nine, not 9.', phraseGroups: ['Nine', 'not 9.'], stressWords: ['Nine', '9'], revision: 3 });
  const before = structuredClone(row); await importRecords([row], options(root)); assert.deepEqual(row, before);
  const installed = JSON.parse(await readFile(join(root, 'read-aloud/ra-000001.json'), 'utf8'));
  for (const key of ['prompt', 'answer', 'transcript', 'phraseGroups', 'stressWords', 'revision']) assert.deepEqual(installed[key], row[key]);
});
test('audio reference integrity failure blocks import before reservation', async t => {
  const root = await authorRoot(t);
  await rejectsAuthor(() => importRecords([record({ audio: { path: '/audio/absent.mp3' } })], { ...options(root), audioOptions: { audioRoot: join(root, 'no-audio') } }), 'AUDIO_NOT_FOUND');
  assert.equal((await readRegistry(root)).entries.length, initialRegistry().entries.length);
});
test('staging failure and registry-write failure install nothing and preserve previous sources', async t => {
  for (const failure of [
    { installOptions: { stageWrite: async () => { throw new Error('staging failure'); } } },
    { registryOptions: { replace: async () => { throw new Error('registry failure'); } } },
  ]) {
    const root = await authorRoot(t), before = await snapshot(root);
    await rejectsAuthor(() => importRecords([record()], { ...options(root), ...failure }), 'AUTHOR_WRITE_FAILED');
    const after = await snapshot(root); delete after['import-history/']; assert.deepEqual(after, before);
    assert.equal((await readRegistry(root)).entries.length, initialRegistry().entries.length);
  }
});
test('installation failure rolls back all owned files while retaining committed reservations', async t => {
  const root = await authorRoot(t); let installed = 0;
  await assert.rejects(importRecords([record(), record({ prompt: 'Second draft.' })], { ...options(root), installOptions: { installLink: async (from, to) => {
    if (++installed === 2) throw new Error('disk failure'); await link(from, to);
  } } }), error => error.reservedIds.length === 2);
  assert.equal((await readRegistry(root)).entries.length, initialRegistry().entries.length + 2);
  assert.deepEqual(await readdir(join(root, 'read-aloud')), []);
  const next = await importRecords([record()], options(root)); assert.deepEqual(next.itemIds, ['ra-000003']);
});
test('destination collision never overwrites another author file', async t => {
  const root = await authorRoot(t), target = join(root, 'read-aloud/ra-000001.json');
  await assert.rejects(importRecords([record()], { ...options(root), installOptions: { installLink: async (from, to) => {
    await writeFile(to, 'another author', { flag: 'wx' }); await link(from, to);
  } } }), error => error.recoveryRequired === true);
  assert.equal(await readFile(target, 'utf8'), 'another author'); assert.equal((await readRegistry(root)).entries.length, initialRegistry().entries.length + 1);
});
test('recovery removes only verified staged hardlinks and retains reserved IDs', async t => {
  const root = await authorRoot(t), stage = join(root, '.author-stage'); await mkdir(stage); await mkdir(join(root, 'import-history'));
  const item = { ...record({ id: 'ra-000001' }), revision: 1, status: 'draft', source: 'internal' };
  const registry = await readRegistry(root); registry.entries.push({ id: item.id, taskType: item.taskType, kind: 'reserved' }); await writeFile(join(root, 'id-registry.json'), jsonBytes(registry));
  const bytes = jsonBytes(canonicalItem(item)), history = jsonBytes({ batchId: randomUUID(), itemIds: [item.id] });
  const batchId = JSON.parse(history).batchId, hash = text => createHash('sha256').update(text).digest('hex');
  await writeFile(join(stage, 'journal.json'), jsonBytes({ version: 1, batchId, entries: [{ id: item.id, taskType: item.taskType, sha256: hash(bytes) }], historyHash: hash(history) }));
  await writeFile(join(stage, item.id + '.json'), bytes); await writeFile(join(stage, 'history.json'), history);
  await link(join(stage, item.id + '.json'), join(root, item.taskType, item.id + '.json'));
  await recoverAuthorStage(root);
  await assert.rejects(lstat(stage), { code: 'ENOENT' }); assert.deepEqual(await readdir(join(root, item.taskType)), []);
  assert.ok((await readRegistry(root)).entries.some(entry => entry.id === item.id));
});
test('CLI dry-run validates fixtures and writes neither registry nor production drafts', () => {
  const before = readFile(resolve('content/id-registry.json'), 'utf8');
  const result = spawnSync(process.execPath, ['tools/content/import.mjs', 'tests/fixtures/import/drafts.csv', '--source', 'internal', '--allocate-ids', '--dry-run'], { encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stdout + result.stderr); const report = JSON.parse(result.stdout); assert.equal(report.dryRun, true);
  return before.then(async bytes => assert.equal(await readFile('content/id-registry.json', 'utf8'), bytes));
});
for (const size of [100, 1000]) test(`synthetic ${size}-row import validates, allocates and stages outside production`, async t => {
  const root = await authorRoot(t), rows = Array.from({ length: size }, (_, i) => record({ prompt: `Synthetic fixture ${i}.`, tags: ['scale-test'] }));
  let phase = performance.now(); const parsed = parseInput(JSON.stringify(rows), 'json'), parseMs = performance.now() - phase;
  phase = performance.now(); const mapped = parsed.map(row => mapRecord(row, { format: 'json', source: 'internal', allocateIds: true })), mapMs = performance.now() - phase;
  phase = performance.now(); const ids = simulateIds(initialRegistry(), mapped.map(row => row.taskType)), allocationMs = performance.now() - phase;
  phase = performance.now(); validateImportRecords(mapped.map((row, index) => ({ ...row, id: ids[index] }))); const validationMs = performance.now() - phase;
  const start = performance.now(), result = await importRecords(rows, options(root));
  t.diagnostic(JSON.stringify({ size, parseMs, mapMs, allocationMs, validationMs, ...result.timings, importMs: Number((performance.now() - start).toFixed(2)), environment: 'Node filesystem fixture; not browser startup performance' }));
  assert.equal(result.createdDrafts, size); assert.equal((await readRegistry(root)).entries.length, size + initialRegistry().entries.length);
  assert.equal((await readdir(join(root, 'read-aloud'))).length, size);
});

test('partial staging write is safely discarded before any ID commit', async t => {
  const root = await authorRoot(t);
  await rejectsAuthor(() => importRecords([record()], { ...options(root), installOptions: { stageWrite: async path => {
    await writeFile(path, '{partial'); throw new Error('disk full');
  } } }), 'AUTHOR_WRITE_FAILED');
  assert.equal((await readRegistry(root)).entries.length, initialRegistry().entries.length);
  await assert.rejects(lstat(join(root, '.author-stage')), { code: 'ENOENT' });
});
test('bounded UTF-8 file reads report CSV errors separately from JSON syntax', async t => {
  const root = await authorRoot(t), csv = join(root, 'invalid.csv');
  await writeFile(csv, Buffer.from([0xff, 0xfe]));
  await rejectsAuthor(() => importFile(csv, options(root)), 'IMPORT_INVALID_CSV');
});
