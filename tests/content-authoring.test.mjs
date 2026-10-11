import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, mkdir, rm, readdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { initialRegistry, validateRegistry, simulateIds, reserveId, readRegistry, auditIds, appendReservations, withRegistryLock } from '../tools/content/ids.mjs';
import { newItem } from '../tools/content/new-item.mjs';
import { buildBank } from '../tools/content/build.mjs';
import { parseQuestionBankItemJson } from '../src/domain/content/validation.ts';
import { authorRoot, record, rejectsAuthor, snapshot } from './helpers/content-authoring.mjs';

test('permanent baseline contains exactly all 17 historical and three technical identities', () => {
  const registry = validateRegistry(initialRegistry());
  assert.equal(registry.entries.filter(e => e.kind === 'legacy').length, 17);
  assert.equal(registry.entries.filter(e => e.kind === 'technical').length, 3);
  assert.deepEqual(registry.technicalRange, [900000, 999999]);
});
test('allocation uses lowest normal six-digit gap and never recycles abandoned/retired reservations', () => {
  const registry = appendReservations(initialRegistry(), [{ id: 'rs-000001', taskType: 'repeat-sentence' }, { id: 'rs-000003', taskType: 'repeat-sentence' }]);
  registry.entries.at(-2).kind = 'abandoned'; registry.entries.at(-1).kind = 'retired';
  assert.deepEqual(simulateIds(registry, ['repeat-sentence', 'repeat-sentence']), ['rs-000002', 'rs-000004']);
});
test('normal allocation never reaches technical range; bounded space exhaustion is explicit', () => {
  const registry = appendReservations(initialRegistry(), [{ id: 'ra-000001', taskType: 'read-aloud' }]);
  assert.throws(() => simulateIds(registry, ['read-aloud'], { maximum: 1 }), e => e.issues[0].code === 'ID_SPACE_EXHAUSTED');
  assert.throws(() => appendReservations(registry, [{ id: 'ra-900002', taskType: 'read-aloud' }]), e => e.issues[0].code === 'ID_TECHNICAL_RANGE');
});
for (const [label, mutate] of [
  ['duplicate entry', value => value.entries.push(value.entries[0])],
  ['lost historical identity', value => value.entries.shift()],
  ['unknown task', value => value.entries[0].taskType = 'retell-lecture'],
  ['wrong prefix', value => value.entries[0].id = 'ra-001'],
  ['altered range', value => value.technicalRange[0] = 800000],
  ['unexpected field', value => value.nextId = 1],
]) test(`registry rejects ${label}`, () => {
  const value = initialRegistry(); mutate(value);
  assert.throws(() => validateRegistry(value), e => e.issues[0].code === 'ID_REGISTRY_INVALID');
});
test('reservations are durable independently of source existence', async t => {
  const root = await authorRoot(t), first = await reserveId('repeat-sentence', { root }), second = await reserveId('repeat-sentence', { root });
  assert.equal(first.id, 'rs-000001'); assert.equal(second.id, 'rs-000002');
  const audit = await auditIds(root); assert.ok(audit.reservedWithoutSource.includes(first.id)); assert.equal(audit.nextNormalIds['repeat-sentence'], 'rs-000003');
});
test('lock contention fails closed; after release a distinct ID is allocated', async t => {
  const root = await authorRoot(t);
  await withRegistryLock(root, () => rejectsAuthor(() => reserveId('read-aloud', { root }), 'ID_REGISTRY_LOCKED'));
  assert.equal((await reserveId('read-aloud', { root })).id, 'ra-000001');
});
test('concurrent OS processes cannot reserve the same identity', async t => {
  const root = await authorRoot(t);
  const run = () => new Promise((done, fail) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', `import {reserveId} from './tools/content/ids.mjs'; try { console.log(JSON.stringify(await reserveId('read-aloud', {root:${JSON.stringify(root)}}))); } catch(e) {console.log(JSON.stringify({code:e.issues?.[0].code}));}`], { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let text = ''; child.stdout.on('data', chunk => text += chunk); child.on('error', fail); child.once('close', status => status === 0 ? done(JSON.parse(text)) : fail(new Error('reservation worker failed')));
  });
  const results = await Promise.all([run(), run(), run(), run()]);
  const ids = results.filter(result => result.success).map(result => result.id);
  assert.ok(ids.length > 0); assert.equal(new Set(ids).size, ids.length);
  assert.ok(results.every(result => result.success || result.code === 'ID_REGISTRY_LOCKED'));
  const registry = await readRegistry(root); assert.equal(registry.entries.length, 20 + ids.length);
});
test('scaffolding reserves and writes a valid canonical draft without question activation', async t => {
  const root = await authorRoot(t), result = await newItem('repeat-sentence', { root });
  const item = parseQuestionBankItemJson(await readFile(join(root, 'repeat-sentence', result.id + '.json'), 'utf8'));
  assert.equal(item.status, 'draft'); assert.equal(item.source, 'internal'); assert.equal(item.revision, 1);
  assert.equal((await readRegistry(root)).entries.length, 21);
  const build = await buildBank({ sourceRoot: root, outputRoot: join(root, 'generated'), enforceRegistry: true });
  assert.equal(build.bundle.items[0].id, result.id);
});
test('scaffolding installation failure retains its already committed reservation', async t => {
  const root = await authorRoot(t);
  await rejectsAuthor(() => newItem('read-aloud', { root, installOptions: { stageWrite: async () => { throw new Error('disk failure'); } } }), 'AUTHOR_WRITE_FAILED');
  assert.equal((await readRegistry(root)).entries.at(-1).id, 'ra-000001');
  assert.equal((await reserveId('read-aloud', { root })).id, 'ra-000002');
});
test('registry replacement failure does not allocate or overwrite any identity', async t => {
  const root = await authorRoot(t), before = await snapshot(root);
  await assert.rejects(reserveId('read-aloud', { root, registryOptions: { replace: async () => { throw new Error('write failure'); } } }));
  assert.deepEqual(await snapshot(root), before);
});
test('registry, root and lock symlinks fail safely', async t => {
  const root = await authorRoot(t); await rm(join(root, 'id-registry.json')); await symlink('/etc/passwd', join(root, 'id-registry.json'));
  await rejectsAuthor(() => readRegistry(root), 'ID_REGISTRY_INVALID');
  await mkdir(join(root, 'other')); await symlink(join(root, 'other'), join(root, '.author-lock'));
  await rejectsAuthor(() => reserveId('read-aloud', { root }), 'ID_REGISTRY_LOCKED');
});
test('production filename/id mismatch and unregistered source reject authoring/build', async t => {
  const root = await authorRoot(t), item = { ...record({ id: 'ra-000001' }), revision: 1, status: 'draft', source: 'internal' };
  await writeFile(join(root, 'read-aloud/wrong.json'), JSON.stringify(item));
  await rejectsAuthor(() => reserveId('read-aloud', { root }), 'AUTHOR_FILENAME_MISMATCH');
  await rejectsAuthor(() => buildBank({ sourceRoot: root, outputRoot: join(root, 'generated') }), 'AUTHOR_FILENAME_MISMATCH');
  await rm(join(root, 'read-aloud/wrong.json')); await writeFile(join(root, 'read-aloud/ra-000001.json'), JSON.stringify(item));
  await rejectsAuthor(() => reserveId('read-aloud', { root }), 'ID_REGISTRY_INVALID');
});
test('malformed registry JSON fails without logs containing its raw values', async t => {
  const root = await authorRoot(t); await writeFile(join(root, 'id-registry.json'), '{"private":"/home/private');
  await assert.rejects(readRegistry(root), error => error.issues[0].code === 'ID_REGISTRY_INVALID' && !JSON.stringify(error.issues).includes('/home/private'));
  assert.deepEqual((await readdir(root)).filter(name => name.startsWith('.author')), []);
});

test('production build shares the authoring lock and refuses in-progress writes', async t => {
  const root = await authorRoot(t);
  await withRegistryLock(root, () => rejectsAuthor(() => buildBank({ sourceRoot: root, enforceRegistry: true, outputRoot: join(root, 'generated') }), 'ID_REGISTRY_LOCKED'));
});

test('reserve-id, new-item and ids CLIs operate only on the isolated working-directory content root', async t => {
  const root = await authorRoot(t), content = join(root, 'content'); await mkdir(content);
  const { rename } = await import('node:fs/promises');
  for (const name of ['write-from-dictation', 'repeat-sentence', 'read-aloud', 'id-registry.json']) await rename(join(root, name), join(content, name));
  const { spawnSync } = await import('node:child_process');
  const { resolve } = await import('node:path');
  for (const [script, args] of [['reserve-id', ['repeat-sentence']], ['new-item', ['repeat-sentence']], ['ids', []], ['ids', ['--recover-stage']]]) {
    const run = spawnSync(process.execPath, [resolve('tools/content/' + script + '.mjs'), ...args], { cwd: root, encoding: 'utf8', shell: false });
    assert.equal(run.status, 0, run.stdout + run.stderr); assert.equal(JSON.parse(run.stdout).success, true);
  }
  assert.equal((await readRegistry(content)).entries.length, 22);
  const item = parseQuestionBankItemJson(await readFile(join(content, 'repeat-sentence/rs-000002.json'), 'utf8'));
  assert.equal(item.status, 'draft');
});

test('registry replacement cannot drop an abandoned reservation', async t => {
  const root = await authorRoot(t); await reserveId('read-aloud', { root });
  const { writeRegistry } = await import('../tools/content/ids.mjs');
  await rejectsAuthor(() => writeRegistry(root, initialRegistry()), 'ID_REGISTRY_INVALID');
  assert.equal((await readRegistry(root)).entries.at(-1).id, 'ra-000001');
});
