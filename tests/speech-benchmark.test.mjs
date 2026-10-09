import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateManifest, loadManifest } from '../tools/speech-benchmark/manifest.mjs';
import { measureWordErrors, aggregate, median, representationDifferences, BENCHMARK_NORMALIZATION_VERSION } from '../tools/speech-benchmark/metrics.mjs';
import { verifyModel } from '../tools/speech-benchmark/models.mjs';
import { validateResult, summarize, markdown } from '../tools/speech-benchmark/report.mjs';
import { measureProcess } from '../tools/speech-benchmark/process.mjs';
import { whisperArguments, DEVELOPMENT_ARTIFACTS } from '../runtime/src/whisper.mjs';
import { benchmark } from '../tools/speech-benchmark/benchmark.mjs';

const sample = () => ({ id: 'ra-human-001', task: 'ra', audioFile: 'ra/a.wav', source: 'human',
  expectedText: 'the library opens at nine', spokenReference: 'the library opens at five', referenceVerified: true,
  notes: { speaker: 'speaker-01', l1: 'pt-BR', environment: 'quiet-room', pace: 'normal' } });
const manifest = samples => ({ manifestVersion: 1, samples });
async function temporary(context) {
  const root = await mkdtemp(join(tmpdir(), 'pte-benchmark-test-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('human manifest separates expected from actual speech and rejects invalid ground truth', () => {
  assert.equal(validateManifest(manifest([sample()])).samples[0].spokenReference, 'the library opens at five');
  for (const changed of [{ id: '' }, { task: 'wfd' }, { source: 'synthetic' }, { referenceVerified: false },
    { spokenReference: '' }, { spokenReference: '!!!' }, { expectedText: undefined }, { audioFile: '/private/audio.wav' },
    { audioFile: '../audio.wav' }, { notes: { ...sample().notes, speaker: 'Personal Name' } }]) {
    assert.throws(() => validateManifest(manifest([{ ...sample(), ...changed }])));
  }
  assert.throws(() => validateManifest(manifest([sample(), sample()])));
  assert.throws(() => validateManifest({ manifestVersion: 2, samples: [] }));
  validateManifest(manifest([{ ...sample(), usable: false, spokenReference: '', exclusionReason: 'Unintelligible' }]));
  assert.throws(() => validateManifest(manifest([{ ...sample(), usable: false }])));
  validateManifest(manifest([{ id: 'noise-room-001', task: 'noise', noiseType: 'room-noise', audioFile: 'noise/a.wav', expectedText: '', spokenReference: '' }]));
});

test('manifest verifies missing audio and prevents symlink escape', async context => {
  const root = await temporary(context);
  const file = join(root, 'references.json');
  await mkdir(join(root, 'ra'));
  await writeFile(file, JSON.stringify(manifest([sample()])));
  await assert.rejects(loadManifest(file, root), /Missing audio/);
  await writeFile(join(root, 'ra/a.wav'), 'audio');
  assert.equal((await loadManifest(file, root)).samples.length, 1);
  await symlink('/etc/passwd', join(root, 'ra/escape.wav'));
  await writeFile(file, JSON.stringify(manifest([{ ...sample(), audioFile: 'ra/escape.wav' }])));
  await assert.rejects(loadManifest(file, root), /Invalid audio/);
});

test('shared WER has correct edits, keeps representations raw and versioned', () => {
  const metrics = measureWordErrors('the library opens at nine', 'the library opens at five');
  assert.deepEqual([metrics.S, metrics.D, metrics.I], [1, 0, 0]);
  assert.equal(measureWordErrors('a b c', 'a c').D, 1);
  assert.equal(measureWordErrors('a b', 'a extra b').I, 1);
  assert.equal(measureWordErrors('HELLO, world!', 'hello world').wer, 0);
  const surface = measureWordErrors('behaviour nine', 'behavior 9');
  assert.equal(surface.wer, 1);
  assert.equal(representationDifferences(surface).length, 2);
  assert.equal(BENCHMARK_NORMALIZATION_VERSION, 1);
  assert.throws(() => measureWordErrors('', 'hello'));
});

function row(reference, transcript, id = 'ra-human-001') {
  const edits = measureWordErrors(reference, transcript);
  const performance = { inferenceMs: 100, rtf: 0.1, peakRssBytes: null };
  return { id, task: 'ra', model: 'base.en', status: 'ok', ...edits, referenceWords: edits.words,
    representationCount: 0, audioMs: 1000, ...performance, runs: [1, 2, 3].map(() => ({ status: 'ok', ...performance })) };
}
function result(samples) {
  return { benchmarkVersion: 1, normalizationVersion: 1, createdAt: new Date().toISOString(), samples,
    models: { 'base.en': { bytes: 123, sha256: 'test' }, 'small.en': { status: 'failed' } },
    corpus: { speakerCount: 1, samples: [{ id: 'ra-human-001', task: 'ra', usable: true }] },
    config: { threads: 4 }, git: { sha: 'abc', dirty: true }, engine: { version: '1.8.3', revision: 'abc' },
    hardware: { cpu: 'test', physicalCores: null, logicalCores: 4, ramBytes: 1000, os: 'test', arch: 'x64' } };
}

test('corpus WER weights words; failed samples remain counted and never perfect', () => {
  const rows = [row('one', 'two'), row('a b c d e f g h i', 'a b c d e f g h i', 'ra-human-002'), { status: 'failed' }];
  const report = aggregate(rows);
  assert.equal(report.corpusWer, 0.1);
  assert.equal(report.meanSampleWer, 0.5);
  assert.equal(report.failures, 1);
  assert.equal(report.medianSampleWer, 0.5);
  assert.equal(report.worstSampleWer, 1);
  assert.equal(aggregate([{ status: 'failed' }]).corpusWer, null);
  assert.equal(median([30, 10, 20]), 20);
});

test('result validation and publication use an allowlist without private text or paths', () => {
  const value = result([row('spoken private name', 'spoken private name')]);
  value.samples[0].spokenReference = 'Private Name';
  value.samples[0].audioFile = '/home/private/file.wav';
  value.samples[0].runs[0].transcript = 'Private Name';
  const summary = summarize(value), json = JSON.stringify(summary), md = markdown(summary);
  assert.ok(!json.includes('Private Name') && !json.includes('/home/private') && !md.includes('Private Name'));
  assert.match(md, /Overall WER/);
  assert.match(md, /pending/);
  assert.equal(summary.aggregates['base.en'].ra.corpusWer, 0);
  assert.throws(() => validateResult({ ...value, normalizationVersion: 2 }));
  assert.throws(() => validateResult(result([{ ...value.samples[0], wer: 9 }])));
  assert.throws(() => validateResult(result([{ ...value.samples[0], runs: [] }])));
  assert.throws(() => validateResult(result([value.samples[0], value.samples[0]])));
});

test('model verification rejects corrupted or unsupported artifacts', async context => {
  const root = await temporary(context);
  await writeFile(join(root, 'ggml-base.en.bin'), 'corrupt');
  await assert.rejects(verifyModel('base.en', root), /integrity/);
  await assert.rejects(verifyModel('tiny.en', root), /Unsupported/);
  await assert.rejects(verifyModel('small.en', root));
});

test('six paired human samples are provisional and require a Brazilian L1 speaker', () => {
  const rows = [];
  const corpusSamples = [];
  for (const task of ['ra', 'rs']) {
    for (let index = 1; index <= 3; index++) {
      const id = `${task}-human-00${index}`;
      corpusSamples.push({ id, task, usable: true, l1: 'pt-BR' });
      for (const model of ['base.en', 'small.en']) rows.push({ ...row('the library opens at five', 'the library opens at five', id), task, model });
    }
  }
  const value = result(rows);
  value.corpus.samples = corpusSamples;
  const summary = summarize(value);
  assert.equal(summary.gate.humanGate, true);
  assert.equal(summary.gate.preferredCorpus, false);
  assert.match(summary.gate.recommendation, /provisional/);
  value.corpus.samples.forEach(sample => { sample.l1 = 'other'; });
  assert.equal(summarize(value).gate.humanGate, false);
});

test('CLI measurement records success, failure, timeout and cancellation', async context => {
  const root = await temporary(context), script = join(root, 'cli.mjs');
  await writeFile(script, "if (process.argv[2] === 'hang') setInterval(() => {}, 1000); else if (process.argv[2] === 'fail') process.exit(2); else console.log('the library opens at five');");
  const options = { timeoutMs: 1000, signal: new AbortController().signal };
  const success = await measureProcess(process.execPath, [script], options);
  assert.equal(success.status, 'ok');
  assert.equal(success.transcript, 'the library opens at five');
  assert.ok(success.inferenceMs >= 0);
  assert.equal((await measureProcess(process.execPath, [script, 'fail'], options)).status, 'failed');
  assert.equal((await measureProcess(process.execPath, [script, 'hang'], { ...options, timeoutMs: 50 })).error, 'INFERENCE_TIMEOUT');
  const controller = new AbortController();
  const pending = measureProcess(process.execPath, [script, 'hang'], { ...options, signal: controller.signal });
  controller.abort();
  assert.equal((await pending).error, 'ABORTED');
  assert.equal((await measureProcess('/does-not-exist', [], options)).error, 'PROCESS_UNAVAILABLE');
});

test('committed config stays aligned with production audio-only decoding', async () => {
  const config = JSON.parse(await readFile(new URL('../tools/speech-benchmark/config.json', import.meta.url)));
  assert.deepEqual(config.models, ['base.en', 'small.en']);
  assert.equal(config.repetitions, 3);
  assert.equal(config.prompt, null);
  const args = whisperArguments('MODEL', 'WAV');
  assert.ok(args.includes('--no-gpu') && args.includes('--no-timestamps'));
  assert.equal(args[args.indexOf('--threads') + 1], String(config.threads));
  assert.ok(!args.includes('--prompt'));
});

test('installed baseline model identity matches upstream when present', async context => {
  try { await stat(join(DEVELOPMENT_ARTIFACTS.modelRoot, 'ggml-base.en.bin')); }
  catch { context.skip('No local model installed'); return; }
  const model = await verifyModel('base.en');
  assert.equal(model.bytes, 147964211);
  assert.equal(model.sha256, 'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002');
});

test('runner shares one normalized file, preserves failures/variation and never overwrites archives', async context => {
  const root = await temporary(context), corpus = join(root, 'corpus'), refs = join(root, 'references.json');
  await mkdir(join(corpus, 'ra'), { recursive: true });
  await writeFile(join(corpus, 'ra/a.wav'), 'fixture audio; synthetic unit-test data only');
  await writeFile(refs, JSON.stringify(manifest([sample()])));
  let normalized, preprocessCount = 0, calls = 0;
  const dependencies = {
    engine: async () => ({ version: '1.8.3', revision: 'fixture', executableSha256: 'fixture' }),
    verifyModel: async id => ({ id, filename: `ggml-${id}.bin`, bytes: 1, sha256: 'fixture' }),
    hashFile: async () => ({ sha256: 'fixture' }),
    preprocessAudio: async files => {
      preprocessCount++; normalized = files.normalizedPath;
      await writeFile(normalized, 'normalized fixture');
      return { normalizedPath: normalized, durationMs: 1000, preprocessingMs: 5 };
    },
    measureProcess: async (_executable, args) => {
      assert.equal(args[args.indexOf('--file') + 1], normalized);
      assert.ok(!args.includes(sample().spokenReference) && !args.includes(sample().expectedText));
      calls++;
      if (calls % 6 === 5) return { status: 'failed', error: 'INFERENCE_TIMEOUT', inferenceMs: 100, peakRssBytes: null };
      return { status: 'ok', transcript: calls % 6 === 1 ? 'the library opens at nine' : 'the library opens at five',
        inferenceMs: 10 + calls, peakRssBytes: 1024 };
    }
  };
  const options = { manifestPath: refs, corpusRoot: corpus, outputRoot: join(root, 'results'), signal: new AbortController().signal };
  const first = await benchmark(options, dependencies);
  assert.equal(calls, 6); assert.equal(preprocessCount, 1);
  assert.equal(first.result.samples[0].wer, 0.2); // First run retained, not perfect later runs.
  assert.equal(first.result.samples[0].transcriptVariants, 2);
  assert.equal(first.result.samples[0].inferenceMs, 12);
  assert.equal(first.result.samples[1].status, 'failed');
  assert.equal(first.result.samples[1].runs.length, 3);
  assert.equal(summarize(first.result).aggregates['small.en'].overall.corpusWer, null);
  await assert.rejects(stat(normalized), { code: 'ENOENT' });
  assert.equal(await readFile(join(corpus, 'ra/a.wav'), 'utf8'), 'fixture audio; synthetic unit-test data only');
  const privateJson = await readFile(join(first.output, 'results.json'), 'utf8');
  assert.match(privateJson, /spokenReference/);
  assert.ok(!(await readFile(join(first.output, 'summary.json'), 'utf8')).includes('spokenReference'));
  const second = await benchmark(options, dependencies);
  assert.notEqual(first.output, second.output);
  assert.equal(await readFile(join(first.output, 'results.json'), 'utf8'), privateJson);
  const changed = await benchmark(options, { ...dependencies, hashFile: async path => ({ sha256: path === DEVELOPMENT_ARTIFACTS.executable ? 'changed' : 'fixture' }) });
  assert.equal(changed.result.samples[0].status, 'failed');
  assert.equal(changed.result.samples[0].error, 'ARTIFACT_CHANGED');
  assert.equal(summarize(changed.result).aggregates['base.en'].overall.corpusWer, null);
});
