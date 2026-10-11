import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, copyFile, truncate } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { validateAudioAssets, resolveAudioPath, AUDIO_MAX_BYTES } from '../tools/content/audio-integrity.mjs';
import { inspectAudioMetadata, AudioError, createAudioMedia } from '../tools/content/media-probe.mjs';
import { runNative } from '../runtime/src/nativeProcess.mjs';
import { buildBank } from '../tools/content/build.mjs';
import { verifyGenerated } from '../tools/content/verify.mjs';
const tone = await readFile('tests/fixtures/audio/valid/tone.mp3');
const sha256 = createHash('sha256').update(tone).digest('hex');
const item = (extra = {}) => ({ id: 'rs-000001', status: 'draft', audio: { path: '/audio/tone.mp3', ...extra } });
const probe = () => ({ streams: [{ codec_type: 'audio', codec_name: 'mp3', sample_rate: '22050', channels: 1 }], format: { format_name: 'mp3', duration: '0.313469' } });
const fakeMedia = () => ({ probe: async () => probe(), decode: async () => 250 });
async function space(t) {
  const root = await mkdtemp(join(tmpdir(), 'pte-content-audio-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const audioRoot = join(root, 'audio'); await mkdir(audioRoot); await writeFile(join(audioRoot, 'tone.mp3'), tone);
  return { root, audioRoot };
}
async function check(t, content = [item()], mutate = async () => {}, media = fakeMedia()) {
  const { audioRoot, root } = await space(t); await mutate(audioRoot, root);
  return validateAudioAssets(content, { audioRoot, media, reportOrphans: false });
}
const code = (result, expected) => assert.ok(result.errors.some(e => e.code === expected), JSON.stringify(result));

test('real MP3 hash, ffprobe and complete ffmpeg decode return verified metadata without modifying source', async t => {
  const { audioRoot } = await space(t), input = item({ sha256, durationMs: 313, mimeType: 'audio/mpeg' });
  input.status = 'active'; const original = structuredClone(input);
  const result = await validateAudioAssets([input], { audioRoot, reportOrphans: false });
  assert.deepEqual(result.errors, []); assert.deepEqual(input, original);
  assert.equal(result.assets[0].sha256, sha256); assert.equal(result.assets[0].sizeBytes, tone.length);
  assert.equal(result.assets[0].channels, 1); assert.equal(result.assets[0].sampleRate, 22050);
  assert.deepEqual(await readFile(join(audioRoot, 'tone.mp3')), tone);
});
for (const path of ['/audio/../escape.mp3', '/audio/%2e%2e/file.mp3', '/audio/file.mp3?x=1', '/audio/file.mp3#x', 'https://example.com/file.mp3', '//host/file.mp3', '/home/me/file.mp3', 'C:\\file.mp3']) {
  test(`safe resolver rejects ${path}`, async () => {
    await assert.rejects(resolveAudioPath(path), error => error.code === 'INVALID_AUDIO_PATH');
  });
}
for (const [name, mutate, expected] of [
  ['missing', async root => rm(join(root, 'tone.mp3')), 'AUDIO_NOT_FOUND'],
  ['directory', async root => { await rm(join(root, 'tone.mp3')); await mkdir(join(root, 'tone.mp3')); }, 'AUDIO_NOT_REGULAR_FILE'],
  ['symlink file', async (root, outer) => { await rm(join(root, 'tone.mp3')); await writeFile(join(outer, 'outside'), tone); await symlink(join(outer, 'outside'), join(root, 'tone.mp3')); }, 'AUDIO_SYMLINK'],
  ['empty', async root => writeFile(join(root, 'tone.mp3'), ''), 'AUDIO_EMPTY'],
  ['oversized sparse', async root => truncate(join(root, 'tone.mp3'), AUDIO_MAX_BYTES + 1), 'AUDIO_TOO_LARGE'],
  ['wrong bytes', async root => writeFile(join(root, 'tone.mp3'), 'RIFF0000WAVE0000'), 'AUDIO_EXTENSION_MISMATCH'],
]) test(`${name} fails before native work`, async t => {
  let calls = 0; const media = { probe: async () => { calls++; return probe(); }, decode: async () => { calls++; } };
  const result = await check(t, [item()], mutate, media); code(result, expected); assert.equal(calls, 0);
  assert.equal(JSON.stringify(result).includes(tmpdir() + '/pte-'), false);
});
test('root and intermediate symlinks are rejected', async t => {
  const { audioRoot, root } = await space(t); const alias = join(root, 'alias'); await symlink(audioRoot, alias);
  code(await validateAudioAssets([item()], { audioRoot: alias, media: fakeMedia(), reportOrphans: false }), 'AUDIO_SYMLINK');
  await symlink(root, join(audioRoot, 'nested'));
  code(await validateAudioAssets([item({ path: '/audio/nested/outside.mp3' })], { audioRoot, media: fakeMedia(), reportOrphans: false }), 'AUDIO_SYMLINK');
});
test('valid MP3 with a wrong extension fails', async t => {
  code(await check(t, [item({ path: '/audio/tone.wav' })], root => copyFile(join(root, 'tone.mp3'), join(root, 'tone.wav'))), 'AUDIO_EXTENSION_MISMATCH');
});
for (const [label, metadata, expected] of [
  ['incorrect hash', { sha256: 'b'.repeat(64) }, 'AUDIO_HASH_MISMATCH'],
  ['MIME mismatch', { mimeType: 'audio/wav' }, 'AUDIO_MIME_MISMATCH'],
  ['duration mismatch', { durationMs: 600 }, 'AUDIO_DURATION_MISMATCH'],
]) test(label, async t => code(await check(t, [item(metadata)]), expected));
test('duration tolerance includes 100 ms and 1% for longer audio', async t => {
  assert.deepEqual((await check(t, [item({ durationMs: 413 })])).errors, []);
  code(await check(t, [item({ durationMs: 414 })]), 'AUDIO_DURATION_MISMATCH');
  const media = { ...fakeMedia(), probe: async () => ({ ...probe(), format: { format_name: 'mp3', duration: '100' } }) };
  assert.deepEqual((await check(t, [item({ durationMs: 101000 })], undefined, media)).errors, []);
  code(await check(t, [item({ durationMs: 101001 })], undefined, media), 'AUDIO_DURATION_MISMATCH');
});
test('changed bytes at same path reject stale declared hash on next validation', async t => {
  const { audioRoot } = await space(t), media = fakeMedia();
  assert.deepEqual((await validateAudioAssets([item({ sha256 })], { audioRoot, media, reportOrphans: false })).errors, []);
  await writeFile(join(audioRoot, 'tone.mp3'), Buffer.concat([tone, Buffer.from('changed')]));
  code(await validateAudioAssets([item({ sha256 })], { audioRoot, media, reportOrphans: false }), 'AUDIO_HASH_MISMATCH');
});
test('shared asset is probed/decoded once but each declaration is checked', async t => {
  let probes = 0, decodes = 0;
  const media = { probe: async () => { probes++; return probe(); }, decode: async () => { decodes++; } };
  const result = await check(t, [item({ sha256 }), { ...item({ sha256: 'b'.repeat(64) }), id: 'rs-000002' }], undefined, media);
  code(result, 'AUDIO_HASH_MISMATCH'); assert.equal(probes, 1); assert.equal(decodes, 1); assert.equal(result.assets.length, 1);
});
for (const [label, mutate, expected] of [
  ['no stream', v => v.streams = [], 'AUDIO_MULTIPLE_STREAMS'],
  ['multiple streams', v => v.streams.push(v.streams[0]), 'AUDIO_MULTIPLE_STREAMS'],
  ['video', v => v.streams[0].codec_type = 'video', 'AUDIO_MULTIPLE_STREAMS'],
  ['container', v => v.format.format_name = 'wav', 'AUDIO_EXTENSION_MISMATCH'],
  ['codec', v => v.streams[0].codec_name = 'aac', 'AUDIO_UNSUPPORTED_CODEC'],
  ['channels', v => v.streams[0].channels = 6, 'AUDIO_UNSUPPORTED_LAYOUT'],
  ['sample rate', v => v.streams[0].sample_rate = '192000', 'AUDIO_UNSUPPORTED_LAYOUT'],
  ['duration infinite', v => v.format.duration = 'Infinity', 'AUDIO_INVALID_DURATION'],
  ['duration extreme', v => v.format.duration = '181', 'AUDIO_INVALID_DURATION'],
]) test(`metadata policy: ${label}`, () => {
  const value = probe(); mutate(value); assert.throws(() => inspectAudioMetadata(value), e => e.code === expected);
});
test('real corrupt/truncated MP3 is rejected', async t => {
  const { audioRoot } = await space(t);
  await writeFile(join(audioRoot, 'tone.mp3'), tone.subarray(0, 32));
  const result = await validateAudioAssets([item()], { audioRoot, reportOrphans: false });
  assert.ok(result.errors.some(e => ['AUDIO_PROBE_FAILED', 'AUDIO_DECODE_FAILED'].includes(e.code)));
});
test('decode and probe failures are safe structured diagnostics', async t => {
  for (const step of ['probe', 'decode']) {
    const media = fakeMedia(); media[step] = async () => { throw new AudioError(step === 'probe' ? 'AUDIO_PROBE_FAILED' : 'AUDIO_DECODE_FAILED', 'Media validation failed.'); };
    code(await check(t, [item()], undefined, media), step === 'probe' ? 'AUDIO_PROBE_FAILED' : 'AUDIO_DECODE_FAILED');
  }
});
test('native checker uses file-only protocols and forced MP3 format', async t => {
  const { root } = await space(t); const recorder = join(root, 'native');
  // Controlled executable reports argv; it never executes any content-provided code.
  await writeFile(recorder, '#!/usr/bin/node\nconsole.log(JSON.stringify({argv:process.argv.slice(2)}));\n', { mode: 0o700 });
  const media = await createAudioMedia({ ffmpeg: recorder, ffprobe: recorder });
  const result = await media.probe(join(root, 'audio/tone.mp3'));
  const args = result.argv;
  assert.equal(args[args.indexOf('-protocol_whitelist') + 1], 'file');
  assert.equal(args[args.indexOf('-format_whitelist') + 1], 'mp3');
  assert.equal(args[args.indexOf('-f') + 1], 'mp3');
  assert.equal(args.includes('http'), false);
});
test('shared native executor times out and awaits child termination', async t => {
  const { root } = await space(t); const executable = join(root, 'stalled');
  await writeFile(executable, '#!/usr/bin/node\nsetInterval(()=>{},1000);\n', { mode: 0o700 });
  let pid; const failure = () => new AudioError('AUDIO_PROBE_FAILED', 'Bounded tool failed.');
  await assert.rejects(runNative(executable, [], { signal: new AbortController().signal, timeoutMs: 100,
    unavailable: failure, failed: failure, timeout: failure, onSpawn: value => pid = value }), e => e.code === 'AUDIO_PROBE_FAILED');
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});
test('orphan assets are warnings and publication duration is advisory', async t => {
  const { audioRoot } = await space(t);
  const orphan = await validateAudioAssets([], { audioRoot });
  assert.equal(orphan.warnings[0].code, 'AUDIO_ORPHAN'); assert.deepEqual(orphan.errors, []);
  const result = await validateAudioAssets([{ ...item({ sha256 }), status: 'retired' }], { audioRoot, media: fakeMedia() });
  assert.deepEqual(result.errors, []); assert.equal(result.warnings[0].code, 'AUDIO_DURATION_UNDECLARED');
});
test('audio failure preserves the last-good generated pair and leaves no staging files', async t => {
  const { root, audioRoot } = await space(t), sourceRoot = join(root, 'content'), outputRoot = join(root, 'generated');
  for (const task of ['write-from-dictation', 'repeat-sentence', 'read-aloud']) await mkdir(join(sourceRoot, task), { recursive: true });
  const content = { ...item({ sha256 }), taskType: 'repeat-sentence', difficulty: 2, prompt: 'Draft fixture', revision: 1, source: 'internal' };
  const path = join(sourceRoot, 'repeat-sentence/item.json'); await writeFile(path, JSON.stringify(content));
  const audioOptions = { audioRoot, reportOrphans: false };
  const before = await buildBank({ sourceRoot, outputRoot, audioOptions });
  await writeFile(join(audioRoot, 'tone.mp3'), 'corrupt');
  await assert.rejects(buildBank({ sourceRoot, outputRoot, audioOptions }), e => e.errors.some(issue => issue.code === 'AUDIO_EXTENSION_MISMATCH'));
  const after = await verifyGenerated(outputRoot); assert.equal(after.manifest.contentVersion, before.manifest.contentVersion);
  for (const name of ['.generated.content-next', '.generated.content-previous', '.generated.content-lock'])
    await assert.rejects(readFile(join(root, name)), e => e.code === 'ENOENT');
});

test('mutation during native decode is rejected by the final file identity check', async t => {
  const { audioRoot } = await space(t);
  const media = { ...fakeMedia(), decode: async path => writeFile(path, Buffer.concat([tone, Buffer.from('mutation')])) };
  code(await validateAudioAssets([item()], { audioRoot, media, reportOrphans: false }), 'AUDIO_CHANGED');
});
test('misleading short probe duration cannot hide an over-budget decoded stream', async t => {
  const { root } = await space(t), executable = join(root, 'amplified');
  await writeFile(executable, '#!/usr/bin/node\nconsole.log("out_time_us=181000000\\nprogress=end");\n', { mode: 0o700 });
  const media = await createAudioMedia({ ffmpeg: executable, ffprobe: executable });
  await assert.rejects(media.decode(join(root, 'audio/tone.mp3')), e => e.code === 'AUDIO_DECODE_FAILED');
});
