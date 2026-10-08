import assert from 'node:assert/strict';
import nodeTest from 'node:test';
const test = (name, fn) => nodeTest(name, { timeout: 15000 }, fn);
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, copyFile, chmod, rm, readdir, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startRuntime } from '../src/server.mjs';
import { loadConfig, validateConfig } from '../src/config.mjs';
import { createWhisperService, MODEL_MANIFEST, DEVELOPMENT_ARTIFACTS, extractTranscript } from '../src/whisper.mjs';
import { buildTranscriptionResponse } from '../src/transcriptionResponse.mjs';
import { requestBudgetMs } from '../src/audioRequest.mjs';
import { createEngineState } from '../src/engineState.mjs';
import { ENGINE_VERSION, ENGINE_REVISION } from '../src/version.mjs';
import { parseSpeechRuntimeHealth, parseSpeechRuntimeVersion, parseSpeechRuntimeTranscription } from '../../src/domain/speech/runtimeTypes.ts';
import { freePort, launchRuntime } from './helpers.mjs';

const defaults = await loadConfig();
async function fixture(context) {
  const base = await mkdtemp(join(tmpdir(), 'pte-whisper-test-'));
  context.after(async () => { await filesRuntime?.close(); await rm(base, { recursive: true, force: true }); });
  let filesRuntime;
  const executable = join(base, 'fake-whisper.mjs');
  await copyFile(new URL('./fixtures/fake-whisper.mjs', import.meta.url), executable); await chmod(executable, 0o700);
  const model = Buffer.from('controlled test model artifact, not real Whisper weights');
  const modelPath = join(base, 'ggml-base.en.bin'); await writeFile(modelPath, model);
  const buildInfo = join(base, 'whisper-config.cmake');
  await writeFile(buildInfo, `set(WHISPER_VERSION      ${ENGINE_VERSION})\nset(WHISPER_BUILD_COMMIT ${ENGINE_REVISION.slice(0, 7)})\n`);
  const modePath = join(base, 'mode.json');
  const mode = (value, text) => writeFile(modePath, JSON.stringify({ mode: value, text })); await mode('success');
  const models = { 'base.en': { filename: 'ggml-base.en.bin', minBytes: model.length, maxBytes: model.length,
    sha1: createHash('sha1').update(model).digest('hex'), sha256: createHash('sha256').update(model).digest('hex') } };
  return { base, mode, modelPath, executable, buildInfo, registerRuntime(runtime) { filesRuntime = runtime; },
    artifacts: { executable, buildInfo, modelRoot: base, models } };
}
async function launch(context, files, changes = {}, options = {}) {
  const config = { ...defaults, port: await freePort(), ...changes };
  const runtime = await startRuntime(config, { tempBase: files.base,
    initializeEngine: opts => createWhisperService({ ...opts, artifacts: files.artifacts }), ...options });
  files.registerRuntime(runtime); await runtime.initialized;
  const root = join(files.base, `pte-study-runtime-${process.getuid?.() ?? 'user'}`, `port-${config.port}`);
  return { runtime, config, origin: `http://127.0.0.1:${config.port}`, root };
}
function audio() {
  const wav = Buffer.alloc(3244); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(3200, 40);
  return wav;
}
function form() { const value = new FormData(); value.append('audio', new Blob([audio()], { type: 'audio/wav' }), 'private.wav'); value.append('language', 'en'); return value; }
async function post(env, signal) {
  const response = await fetch(`${env.origin}/api/v1/transcribe`, { method: 'POST', headers: { Origin: env.origin }, body: form(), signal });
  return { status: response.status, body: await response.json() };
}
async function health(env) { return parseSpeechRuntimeHealth(await (await fetch(`${env.origin}/api/v1/health`)).json()); }
async function clean(env) {
  for (let i = 0; i < 200; i++) { if (!(await readdir(env.root)).some(name => name.startsWith('request-'))) return; await delay(10); }
  throw new Error('Temporary audio was not cleaned');
}
function error(result, status, code) {
  assert.equal(result.status, status); assert.equal(result.body.error.code, code);
  assert.doesNotMatch(JSON.stringify(result.body), /secret|private.wav|\/tmp\/|native|ggml-/);
}
async function activePid(files) {
  for (let i = 0; i < 200; i++) {
    try { return Number(await readFile(join(files.base, 'pid'), 'utf8')); } catch { await delay(10); }
  }
  throw new Error('Owned child did not start');
}

test('trusted engine/model initialization produces ready health and real wire-contract evidence from controlled CLI output', async context => {
  const files = await fixture(context);
  let inputStillExists = false;
  const env = await launch(context, files, {}, { async onNormalized(value) {
    inputStillExists = (await stat(value.normalizedPath)).isFile();
    assert.deepEqual((await readdir(join(value.normalizedPath, '..'))).sort(), ['input.bin', 'normalized.wav']);
  } });
  assert.equal((await health(env)).status, 'ready'); assert.equal((await health(env)).model.loaded, true);
  await clean(env); // Startup model-load check also cleaned its synthetic WAV.
  const response = await post(env); assert.equal(response.status, 200);
  const parsed = parseSpeechRuntimeTranscription(response.body);
  assert.equal(parsed.text, 'The university library will remain open.'); assert.equal(parsed.model, 'base.en');
  assert.equal(parsed.engine, 'whisper.cpp'); assert.equal(parsed.language, 'en'); assert.equal(parsed.processedLocally, true);
  assert.equal(parsed.timing.audioMs, 100); assert.ok(parsed.timing.inferenceMs > 0); assert.ok(parsed.timing.totalMs >= parsed.timing.inferenceMs);
  assert.equal(parsed.confidence, undefined); assert.ok(inputStillExists); await clean(env);
  const args = JSON.parse(await readFile(join(files.base, 'args.json')));
  assert.deepEqual(args.filter(value => value.startsWith('--')), ['--model', '--file', '--language', '--threads', '--no-gpu', '--no-prints', '--no-timestamps', '--suppress-nst']);
  assert.equal(args[args.indexOf('--language') + 1], 'en');
  assert.equal(args[args.indexOf('--model') + 1], files.modelPath);
  assert.ok(args[args.indexOf('--file') + 1].endsWith('/normalized.wav'));
  assert.ok(!args.join(' ').includes(parsed.text)); assert.ok(!args.some(value => /prompt|grammar|output|translate/.test(value)));
});

test('missing, corrupt, wrong-size and unusable model never become ready; version stays available and inference is blocked', async context => {
  for (const kind of ['missing', 'corrupt', 'wrong-size', 'cannot-load']) {
    const files = await fixture(context);
    if (kind === 'missing') await unlink(files.modelPath);
    if (kind === 'corrupt') { const bytes = await readFile(files.modelPath); bytes[0] ^= 1; await writeFile(files.modelPath, bytes); }
    if (kind === 'wrong-size') await writeFile(files.modelPath, 'bad');
    if (kind === 'cannot-load') await files.mode('fail');
    const env = await launch(context, files);
    const value = await health(env); assert.equal(value.status, 'error'); assert.equal(value.model.loaded, false); assert.equal(value.error.code, 'MODEL_UNAVAILABLE');
    error(await post(env), 503, 'MODEL_UNAVAILABLE'); await clean(env);
    const response = await fetch(`${env.origin}/api/v1/version`); assert.equal(response.status, 200);
    assert.equal(parseSpeechRuntimeVersion(await response.json()).engineVersion, '1.8.3');
    if (kind !== 'cannot-load') await assert.rejects(stat(join(files.base, 'pid')), { code: 'ENOENT' });
  }
});

test('missing executable or mismatched build metadata fail safely with no PATH fallback', async context => {
  for (const kind of ['missing-engine', 'wrong-version']) {
    const files = await fixture(context);
    if (kind === 'missing-engine') await unlink(files.executable);
    else await writeFile(files.buildInfo, 'set(WHISPER_VERSION      9.9.9)');
    const env = await launch(context, files);
    assert.equal((await health(env)).status, 'error'); assert.equal((await health(env)).model.loaded, false);
    error(await post(env), 503, 'RUNTIME_UNAVAILABLE'); await clean(env);
    await assert.rejects(stat(join(files.base, 'pid')), { code: 'ENOENT' });
  }
});

test('empty, malformed, overflowing and crashed inference returns typed errors, cleans audio and allows the next request', async context => {
  const files = await fixture(context), env = await launch(context, files);
  for (const [mode, status, code] of [['empty', 422, 'NO_SPEECH'], ['invalid-utf8', 500, 'INFERENCE_FAILED'],
    ['fail', 500, 'INFERENCE_FAILED'], ['stdout-cap', 500, 'INFERENCE_FAILED'], ['stderr-cap', 500, 'INFERENCE_FAILED']]) {
    await files.mode(mode); error(await post(env), status, code); await clean(env);
    assert.equal((await health(env)).status, 'ready');
    const pid = Number(await readFile(join(files.base, 'pid'), 'utf8'));
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    await files.mode('success'); assert.equal((await post(env)).status, 200); await clean(env);
  }
});

test('inference deadline kills owned process and releases gate; the next inference succeeds', async context => {
  const files = await fixture(context), env = await launch(context, files, { inferenceTimeoutMs: 500 });
  await files.mode('slow'); error(await post(env), 504, 'INFERENCE_TIMEOUT'); await clean(env);
  const pid = Number(await readFile(join(files.base, 'pid'), 'utf8')); assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  await files.mode('success'); assert.equal((await post(env)).status, 200); await clean(env);
});

test('busy spans inference without changing health; disconnect and shutdown kill the child and clean audio', async context => {
  const files = await fixture(context), env = await launch(context, files);
  await unlink(join(files.base, 'pid')); await files.mode('slow');
  const controller = new AbortController();
  const pending = post(env, controller.signal).catch(value => value);
  const pid = await activePid(files);
  error(await post(env), 429, 'RUNTIME_BUSY'); assert.equal((await health(env)).status, 'ready');
  controller.abort(); assert.equal((await pending).name, 'AbortError'); await clean(env);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  await files.mode('success'); assert.equal((await post(env)).status, 200); await clean(env);
  await unlink(join(files.base, 'pid')); await files.mode('slow');
  const shutdownRequest = post(env).catch(value => value);
  const shutdownPid = await activePid(files); await env.runtime.close(); await shutdownRequest; await clean(env);
  assert.throws(() => process.kill(shutdownPid, 0), { code: 'ESRCH' });
});

test('artifact changes after verification make the runtime non-ready before another engine execution', async context => {
  for (const kind of ['model', 'engine']) {
    const files = await fixture(context), env = await launch(context, files);
    if (kind === 'model') await writeFile(files.modelPath, 'changed'); else await unlink(files.executable);
    error(await post(env), 503, kind === 'model' ? 'MODEL_UNAVAILABLE' : 'RUNTIME_UNAVAILABLE');
    assert.equal((await health(env)).status, 'error'); assert.equal((await health(env)).model.loaded, false); await clean(env);
  }
});

test('read-only snapshots, response builder and UTF-8 transcript extraction preserve the domain contract', () => {
  const state = createEngineState(defaults); const initial = state.snapshot(); assert.equal(initial.status, 'starting');
  state.markReady(); assert.equal(initial.modelLoaded, false); assert.equal(state.snapshot().modelLoaded, true);
  assert.ok(Object.isFrozen(state.snapshot())); assert.ok(Object.isFrozen(state.snapshot().build));
  state.markError('MODEL_UNAVAILABLE', 'The model is unavailable.'); assert.equal(state.snapshot().status, 'error'); assert.equal(state.snapshot().modelLoaded, false);
  const valid = { text: ' nine → 9. ', modelId: 'base.en', audioMs: 0, inferenceMs: 1, totalMs: 2 };
  assert.equal(parseSpeechRuntimeTranscription(buildTranscriptionResponse(valid)).text, 'nine → 9.');
  for (const key of ['audioMs', 'inferenceMs', 'totalMs']) for (const value of [-1, NaN, Infinity, 1.5, '1', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => buildTranscriptionResponse({ ...valid, [key]: value }), error => error.code === 'INTERNAL_ERROR');
  }
  for (const value of [{ text: '' }, { modelId: '../bad' }, { totalMs: 0 }]) assert.throws(() => buildTranscriptionResponse({ ...valid, ...value }));
  assert.equal(extractTranscript('\n Hello, world! \n'), 'Hello, world!');
  for (const value of ['', ' \n', '[BLANK_AUDIO]']) assert.throws(() => extractTranscript(value), error => error.code === 'NO_SPEECH');
  for (const value of ['bad\x00text', '\x1b[1mtext', '[00:00:00.000 --> 00:00:01.000] text', 'main: processing private audio', 'whisper_init_from_file: diagnostics']) assert.throws(() => extractTranscript(value), error => error.code === 'INFERENCE_FAILED');
  assert.equal(MODEL_MANIFEST['base.en'].sha1, '137c40403d78fd54d454da0f9bd998f78703390c');
  assert.equal(MODEL_MANIFEST['small.en'].sha1, 'db8a495a91d927739e50b3fc1cc4c6b8f6c2d022');
  assert.ok(DEVELOPMENT_ARTIFACTS.executable.endsWith('/whisper-cli')); assert.equal(requestBudgetMs(defaults), 105000);
  assert.throws(() => validateConfig({ ...defaults, inferenceTimeoutMs: Number.MAX_SAFE_INTEGER }));
});


test('full HTTP transcription with controlled CLI runs under the subprocess no-outbound guard', async context => {
  const files = await fixture(context);
  const config = { ...defaults, port: await freePort() };
  const child = await launchRuntime(config, context, { testArtifacts: files.artifacts });
  await child.ready();
  const env = { origin: `http://127.0.0.1:${config.port}` };
  for (let i = 0; i < 200 && (await health(env)).status === 'starting'; i++) await delay(10);
  assert.equal((await health(env)).status, 'ready');
  const response = await post(env); assert.equal(response.status, 200);
  assert.equal(parseSpeechRuntimeTranscription(response.body).engine, 'whisper.cpp');
  assert.equal(child.output().stderr, '');
  assert.ok(!child.output().stdout.includes(response.body.text));
  assert.doesNotMatch(child.output().stdout, /private.wav|normalized.wav|ggml-base/);
  child.child.kill('SIGTERM'); assert.deepEqual(await child.exited, { code: 0, signal: null });
});

test('startup health remains starting until engine usability is proven; shutdown cancels startup native work', async context => {
  const files = await fixture(context); await files.mode('slow');
  const config = { ...defaults, port: await freePort() };
  const runtime = await startRuntime(config, { tempBase: files.base, initializeEngine: opts => createWhisperService({ ...opts, artifacts: files.artifacts }) });
  files.registerRuntime(runtime);
  const env = { runtime, origin: `http://127.0.0.1:${config.port}`, root: join(files.base, `pte-study-runtime-${process.getuid?.() ?? 'user'}`, `port-${config.port}`) };
  const pid = await activePid(files);
  assert.equal((await health(env)).status, 'starting'); assert.equal((await health(env)).model.loaded, false);
  error(await post(env), 503, 'RUNTIME_STARTING');
  assert.equal((await fetch(`${env.origin}/api/v1/version`)).status, 200);
  await runtime.close(); await clean(env);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  assert.equal(runtime.state.status, 'starting');
});
