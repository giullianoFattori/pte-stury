import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { buildBank } from '../tools/content/build.mjs';
import { prepareBank } from '../tools/content/pipeline.mjs';
import { canonicalBundle, jsonBytes, TASK_ORDER } from '../tools/content/canonicalize.mjs';
import { manifestFor, contentVersion } from '../tools/content/manifest.mjs';
import { discover, BuildError } from '../tools/content/discover.mjs';
import { verifyGenerated, verifyBytes } from '../tools/content/verify.mjs';
import { CONTENT_FIELDS } from '../src/domain/content/validationPolicy.ts';
import { schemaBytes } from '../tools/content/schema.mjs';

const fixtures = resolve('tests/fixtures/content-build');
const fixture = name => join(fixtures, name);
const valid = await prepareBank({ sourceRoot: fixture('valid') });
async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'pte-content-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceRoot = join(root, 'source'), outputRoot = join(root, 'generated');
  for (const task of TASK_ORDER) await mkdir(join(sourceRoot, task), { recursive: true });
  return { root, sourceRoot, outputRoot };
}
async function put(root, item, name = item.id + '.json') {
  await writeFile(join(root, item.taskType, name), jsonBytes(item));
}
const draft = (id = 'ra-000001') => ({ id, taskType: 'read-aloud', difficulty: 2, prompt: 'Distinct authored text', revision: 1, status: 'draft', source: 'internal' });
async function rejectsCode(fn, code) {
  await assert.rejects(fn, error => error instanceof BuildError && error.errors.some(issue => issue.code === code));
}

test('equivalent source keys, filenames, indentation and metadata order produce identical bytes/hash/manifest', async () => {
  const a = await prepareBank({ sourceRoot: fixture('deterministic-a') });
  const b = await prepareBank({ sourceRoot: fixture('deterministic-b') });
  assert.equal(a.bundleBytes, b.bundleBytes); assert.equal(a.manifestBytes, b.manifestBytes);
  assert.equal(a.manifest.contentVersion, b.manifest.contentVersion);
  assert.match(a.manifest.contentVersion, /^sha256:[0-9a-f]{64}$/);
});
test('explicit task/id/property/audio order and stable byte format', () => {
  assert.deepEqual(valid.bundle.items.map(i => i.taskType), TASK_ORDER);
  for (const item of valid.bundle.items) {
    assert.deepEqual(Object.keys(item), CONTENT_FIELDS.filter(key => Object.hasOwn(item, key)));
    if (item.audio) assert.deepEqual(Object.keys(item.audio), ['path', 'sha256', 'durationMs', 'mimeType'].filter(key => Object.hasOwn(item.audio, key)));
  }
  const items = [draft('ra-000003'), draft('ra-000001'), draft('ra-000002')];
  assert.deepEqual(canonicalBundle(items).items.map(i => i.id), ['ra-000001', 'ra-000002', 'ra-000003']);
  assert.equal(valid.bundleBytes, JSON.stringify(valid.bundle, null, 2) + '\n');
  assert.equal(valid.bundleBytes.includes('\r'), false);
  assert.equal(Object.hasOwn(valid.bundle, 'createdAt'), false);
});
for (const [field, value] of [['prompt', 'Changed prompt'], ['revision', 2], ['status', 'retired'], ['difficulty', 3], ['topic', 'Changed topic'], ['answer', 'Changed answer']]) {
  test(`semantic ${field} change alters bytes and hash`, () => {
    const items = structuredClone(valid.bundle.items); items[0][field] = value;
    if (field === 'answer') items[0].transcript = value;
    const bytes = jsonBytes(canonicalBundle(items));
    assert.notEqual(bytes, valid.bundleBytes); assert.notEqual(contentVersion(bytes), valid.manifest.contentVersion);
    verifyBytes(bytes, jsonBytes(manifestFor(canonicalBundle(items), bytes)));
  });
}
test('audio path and identity changes alter hash', () => {
  for (const [field, value] of [['path', '/audio/changed.mp3'], ['sha256', 'b'.repeat(64)]]) {
    const items = structuredClone(valid.bundle.items); items[0].audio[field] = value;
    assert.notEqual(contentVersion(jsonBytes(canonicalBundle(items))), valid.manifest.contentVersion);
  }
});
for (const field of ['chunks', 'phraseGroups', 'stressWords']) {
  test(`semantic array ${field} order is preserved and changes hash`, () => {
    const items = structuredClone(valid.bundle.items), item = items.find(i => i[field]);
    item[field].reverse(); const bundle = canonicalBundle(items);
    assert.deepEqual(bundle.items.find(i => i[field])[field], item[field]);
    assert.notEqual(contentVersion(jsonBytes(bundle)), valid.manifest.contentVersion);
  });
}
test('text, Unicode decomposition, authored whitespace and input immutability are preserved', () => {
  const item = { ...draft(), prompt: '  Café e\u0301 — Colour!\nSecond line.  ', tags: ['z', 'A'], skills: ['speaking', 'reading'] };
  const before = structuredClone(item), bundle = canonicalBundle([item]);
  assert.deepEqual(item, before); assert.equal(bundle.items[0].prompt, item.prompt);
  assert.deepEqual(bundle.items[0].tags, ['A', 'z']); assert.deepEqual(bundle.items[0].skills, ['reading', 'speaking']);
});
test('manifest counts include all lifecycle rows, zero tasks and unique audio paths', () => {
  const items = structuredClone(valid.bundle.items);
  items[0].status = 'draft'; items[1].status = 'retired'; items[1].audio.path = items[0].audio.path;
  const bundle = canonicalBundle(items), manifest = manifestFor(bundle, jsonBytes(bundle));
  assert.equal(manifest.itemCount, 3); assert.equal(manifest.audioAssetCount, 1);
  assert.deepEqual(manifest.countsByTaskType, Object.fromEntries(TASK_ORDER.map(task => [task, 1])));
  const empty = canonicalBundle([]), zero = manifestFor(empty, jsonBytes(empty));
  assert.deepEqual(zero.countsByTaskType, Object.fromEntries(TASK_ORDER.map(task => [task, 0])));
  assert.equal(zero.itemCount, 0); assert.equal(zero.audioAssetCount, 0);
});
test('discovery excludes examples/schema/unregistered trees and sorts nested JSON paths', async t => {
  const { sourceRoot } = await workspace(t);
  await mkdir(join(sourceRoot, 'examples')); await writeFile(join(sourceRoot, 'examples/bad.json'), 'invalid');
  await writeFile(join(sourceRoot, 'read-aloud/.DS_Store'), 'system');
  await writeFile(join(sourceRoot, 'read-aloud/.gitkeep'), '');
  await mkdir(join(sourceRoot, 'read-aloud/nested')); await put(sourceRoot, draft('ra-000002'), 'z.json');
  await writeFile(join(sourceRoot, 'read-aloud/nested/a.json'), jsonBytes(draft()));
  const files = await discover(sourceRoot);
  assert.deepEqual(files.map(i => i.file), ['content/read-aloud/nested/a.json', 'content/read-aloud/z.json']);
});
test('empty production fails; explicit test API can emit an empty verified bundle', async t => {
  const { sourceRoot, outputRoot } = await workspace(t);
  await rejectsCode(() => buildBank({ sourceRoot, outputRoot }), 'EMPTY_BANK');
  await buildBank({ sourceRoot, outputRoot, allowEmpty: true });
  assert.equal((await verifyGenerated(outputRoot)).manifest.itemCount, 0);
});
for (const name of ['unexpected.txt', '.hidden', 'question.JSON']) {
  test(`unregistered source file ${name} fails`, async t => {
    const { sourceRoot } = await workspace(t); await writeFile(join(sourceRoot, 'read-aloud', name), '{}');
    await rejectsCode(() => prepareBank({ sourceRoot }), 'UNEXPECTED_SOURCE_FILE');
  });
}
test('source root/task/file/directory symlinks fail closed', async t => {
  const { root, sourceRoot } = await workspace(t);
  const alias = join(root, 'alias'); await symlink(sourceRoot, alias);
  await rejectsCode(() => prepareBank({ sourceRoot: alias }), 'UNSAFE_SOURCE_ROOT');
  await symlink(join(sourceRoot, 'repeat-sentence'), join(sourceRoot, 'read-aloud/linked'));
  await rejectsCode(() => prepareBank({ sourceRoot }), 'SYMLINK_SOURCE');
  await rm(join(sourceRoot, 'read-aloud/linked'));
  await symlink(resolve('tests/fixtures/content/valid-ra.json'), join(sourceRoot, 'read-aloud/item.json'));
  await rejectsCode(() => prepareBank({ sourceRoot }), 'SYMLINK_SOURCE');
  await rm(join(sourceRoot, 'read-aloud'), { recursive: true }); await symlink(join(sourceRoot, 'repeat-sentence'), join(sourceRoot, 'read-aloud'));
  await rejectsCode(() => prepareBank({ sourceRoot }), 'UNSAFE_TASK_DIRECTORY');
});
test('missing registered directory and misplaced task fail', async t => {
  const { sourceRoot } = await workspace(t); await rm(join(sourceRoot, 'read-aloud'), { recursive: true });
  await rejectsCode(() => prepareBank({ sourceRoot }), 'UNSAFE_TASK_DIRECTORY');
  await mkdir(join(sourceRoot, 'read-aloud')); await writeFile(join(sourceRoot, 'repeat-sentence/ra.json'), jsonBytes(draft()));
  await rejectsCode(() => prepareBank({ sourceRoot }), 'TASK_DIRECTORY_MISMATCH');
});
for (const [name, text, code] of [
  ['malformed', '{"id":', 'INVALID_JSON'],
  ['unknown field', jsonBytes({ ...draft(), dificulty: 2 }), 'UNKNOWN_FIELD'],
  ['duplicate JSON key', '{"id":"ra-000001","id":"ra-000002"}', 'DUPLICATE_JSON_KEY'],
  ['BOM', '\ufeff' + jsonBytes(draft()), 'INVALID_JSON'],
  ['oversized', ' '.repeat(8 * 1024 * 1024 + 1), 'JSON_TOO_LARGE'],
  ['invalid UTF-8', Buffer.from([0xc3, 0x28]), 'INVALID_JSON'],
]) {
  test(`${name} input fails without installing output`, async t => {
    const { sourceRoot, outputRoot } = await workspace(t); await writeFile(join(sourceRoot, 'read-aloud/a.json'), text);
    await rejectsCode(() => buildBank({ sourceRoot, outputRoot }), code);
    await assert.rejects(readdir(outputRoot), { code: 'ENOENT' });
  });
}
test('duplicate ID across revisions is fatal and diagnostics are repeatable', async () => {
  let first;
  for (let run = 0; run < 2; run++) {
    try { await prepareBank({ sourceRoot: fixture('duplicate') }); assert.fail('expected duplicate failure'); }
    catch (error) { assert.ok(error.errors.some(e => e.code === 'DUPLICATE_ID')); if (first) assert.deepEqual(error.errors, first); first = error.errors; }
  }
});
test('warning-only batch builds successfully with prompt/text/audio warnings retained', async t => {
  const { sourceRoot, outputRoot } = await workspace(t), item = structuredClone(valid.bundle.items[1]);
  await put(sourceRoot, item); await put(sourceRoot, { ...item, id: 'rs-000002' });
  const result = await buildBank({ sourceRoot, outputRoot });
  assert.deepEqual(result.warnings.map(i => i.code), ['DUPLICATE_PROMPT', 'DUPLICATE_ANSWER', 'DUPLICATE_TRANSCRIPT', 'DUPLICATE_AUDIO_PATH']);
  assert.equal((await verifyGenerated(outputRoot)).manifest.itemCount, 2);
});
test('failed validation preserves both old outputs and creates no staging files', async t => {
  const { root, sourceRoot, outputRoot } = await workspace(t); await put(sourceRoot, draft());
  const old = await buildBank({ sourceRoot, outputRoot });
  await writeFile(join(sourceRoot, 'read-aloud/bad.json'), '{broken');
  await rejectsCode(() => buildBank({ sourceRoot, outputRoot }), 'INVALID_JSON');
  assert.equal(await readFile(join(outputRoot, 'question-bank.json'), 'utf8'), old.bundleBytes);
  assert.equal(await readFile(join(outputRoot, 'question-bank.manifest.json'), 'utf8'), old.manifestBytes);
  assert.deepEqual((await readdir(root)).sort(), ['generated', 'source']);
});
test('installation rename failure rolls back the complete old pair; later success replaces both', async t => {
  const { root, sourceRoot, outputRoot } = await workspace(t); await put(sourceRoot, draft());
  const old = await buildBank({ sourceRoot, outputRoot }); await put(sourceRoot, { ...draft(), revision: 2 });
  let moves = 0;
  await assert.rejects(buildBank({ sourceRoot, outputRoot, installOptions: { move: async (from, to) => { if (++moves === 2) throw new Error('simulated write failure'); await rename(from, to); } } }));
  assert.equal(await readFile(join(outputRoot, 'question-bank.json'), 'utf8'), old.bundleBytes);
  assert.equal(await readFile(join(outputRoot, 'question-bank.manifest.json'), 'utf8'), old.manifestBytes);
  assert.deepEqual((await readdir(root)).sort(), ['generated', 'source']);
  const next = await buildBank({ sourceRoot, outputRoot }); assert.notEqual(next.bundleBytes, old.bundleBytes);
  assert.equal((await verifyGenerated(outputRoot)).manifest.contentVersion, next.manifest.contentVersion);
});
test('crash backup and partial staging recover conservatively', async t => {
  const { root, sourceRoot, outputRoot } = await workspace(t); await put(sourceRoot, draft()); await buildBank({ sourceRoot, outputRoot });
  await rename(outputRoot, join(root, '.generated.content-previous'));
  await mkdir(join(root, '.generated.content-next')); await writeFile(join(root, '.generated.content-next/question-bank.json'), 'partial');
  await buildBank({ sourceRoot, outputRoot }); await verifyGenerated(outputRoot);
  assert.deepEqual((await readdir(root)).sort(), ['generated', 'source']);
});
test('active lock and unsafe output/stale-stage symlinks fail closed', async t => {
  const { root, sourceRoot, outputRoot } = await workspace(t); await put(sourceRoot, draft());
  const lock = join(root, '.generated.content-lock'); await mkdir(lock); await writeFile(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid }));
  await assert.rejects(buildBank({ sourceRoot, outputRoot })); await rm(lock, { recursive: true });
  await symlink(sourceRoot, outputRoot); await assert.rejects(buildBank({ sourceRoot, outputRoot })); await rm(outputRoot);
  await mkdir(join(root, '.generated.content-next')); await symlink(join(sourceRoot, 'read-aloud/ra-000001.json'), join(root, '.generated.content-next/question-bank.json'));
  await assert.rejects(buildBank({ sourceRoot, outputRoot }));
  assert.equal(await readFile(join(sourceRoot, 'read-aloud/ra-000001.json'), 'utf8'), jsonBytes(draft()));
});
test('verifier rejects tampered bundle, hash/count/schema/task/audio and noncanonical bytes', () => {
  verifyBytes(valid.bundleBytes, valid.manifestBytes);
  for (const change of [m => m.itemCount++, m => m.audioAssetCount++, m => m.countsByTaskType['read-aloud']++, m => m.contentVersion = 'sha256:' + '0'.repeat(64), m => m.schemaVersion = 2, m => m.extra = true]) {
    const manifest = structuredClone(valid.manifest); change(manifest);
    assert.throws(() => verifyBytes(valid.bundleBytes, jsonBytes(manifest)));
  }
  for (const bytes of [valid.bundleBytes.replace('Listen', 'Changed'), JSON.stringify(valid.bundle), valid.bundleBytes.replace('"schemaVersion": 1', '"schemaVersion": 2')]) assert.throws(() => verifyBytes(bytes, valid.manifestBytes));
});
test('committed artifacts match production sources; schema remains unchanged', async () => {
  const built = await prepareBank(), checked = await verifyGenerated();
  assert.equal(await readFile('src/generated/question-bank.json', 'utf8'), built.bundleBytes);
  assert.equal(await readFile('src/generated/question-bank.manifest.json', 'utf8'), built.manifestBytes);
  assert.equal(checked.bundle.items.every(i => i.status === 'draft' && i.tags.includes('build-fixture')), true);
  assert.equal(await readFile('content/schemas/question-bank.schema.json', 'utf8'), schemaBytes());
});
test('build/stats/verifier CLI report success without absolute paths and reject unknown flags', async t => {
  const { root, sourceRoot } = await workspace(t);
  await put(sourceRoot, draft()); await rename(sourceRoot, join(root, 'content'));
  for (const tool of ['build', 'stats', 'verify']) {
    const run = spawnSync(process.execPath, [resolve(`tools/content/${tool}.mjs`)], { encoding: 'utf8', cwd: root });
    assert.equal(run.status, 0, run.stderr); assert.equal(JSON.parse(run.stdout).success, true);
    assert.equal(run.stdout.includes(resolve('.')), false);
  }
  const run = spawnSync(process.execPath, [resolve('tools/content/build.mjs'), '--allow-empty'], { encoding: 'utf8', cwd: root });
  assert.equal(run.status, 1); assert.equal(JSON.parse(run.stderr).errors[0].code, 'INVALID_ARGUMENTS');
});
