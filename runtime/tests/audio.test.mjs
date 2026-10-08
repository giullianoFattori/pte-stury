import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { receiveAudio } from '../src/multipart.mjs';
import { request as httpRequest } from 'node:http';
import { mkdtemp, writeFile, readFile, readdir, rm, mkdir, symlink, stat, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startRuntime } from '../src/server.mjs';
import { loadConfig } from '../src/config.mjs';
import { inspectMedia, runMedia } from '../src/media.mjs';
import { createTempStore } from '../src/temp.mjs';
import { freePort, launchRuntime } from './helpers.mjs';

const defaults = await loadConfig();
const signal = () => new AbortController().signal;
function wav(seconds = 0.2) {
  const samples = Math.round(seconds * 16000), bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) bytes.writeInt16LE(Math.round(4000 * Math.sin(i * 2 * Math.PI * 440 / 16000)), 44 + i * 2);
  return bytes;
}
function part(name, data, mime, filename = 'recording.wav') {
  return Buffer.concat([Buffer.from(`Content-Disposition: form-data; name="${name}"${mime ? `; filename="${filename}"` : ''}\r\n${mime ? `Content-Type: ${mime}\r\n` : ''}\r\n`), Buffer.from(data)]);
}
function multipart(parts = [part('audio', wav(), 'audio/wav'), part('language', 'en')], boundary = 'pte-test') {
  return Buffer.concat([Buffer.from(`--${boundary}\r\n`), ...parts.flatMap((p, i) => [p, Buffer.from(i === parts.length - 1 ? `\r\n--${boundary}--\r\n` : `\r\n--${boundary}\r\n`)])]);
}
async function setup(context, changes = {}, options = {}) {
  const base = await mkdtemp(join(tmpdir(), 'pte-ingestion-test-'));
  const config = { ...defaults, port: await freePort(), ...changes };
  const runtime = await startRuntime(config, { tempBase: base, initializeEngine: async () => ({ transcribeNormalizedAudio: async () => ({ text: 'Controlled local audio.', inferenceMs: 0 }) }), ...options });
  await runtime.initialized;
  const root = join(base, `pte-study-runtime-${process.getuid?.() ?? 'user'}`, `port-${config.port}`);
  context.after(async () => { await runtime.close(); await rm(base, { recursive: true, force: true }); });
  return { runtime, config, root, base, origin: `http://127.0.0.1:${config.port}` };
}
async function post(env, body = multipart(), headers = {}) {
  const response = await fetch(`${env.origin}/api/v1/transcribe`, { method: 'POST', headers: { Origin: env.origin, 'Content-Type': 'multipart/form-data; boundary=pte-test', ...headers }, body });
  return { status: response.status, body: await response.json() };
}
async function waitFor(check) {
  for (let i = 0; i < 200; i++) { if (await check()) return; await delay(10); }
  throw new Error('Timed out waiting for lifecycle condition');
}
async function assertClean(env) { await waitFor(async () => (await readdir(env.root)).filter(name => name.startsWith('request-')).length === 0); }
const success = response => { assert.equal(response.status, 200); assert.equal(response.body.engine, 'whisper.cpp'); assert.equal(response.body.processedLocally, true); };
const code = (response, status, name) => { assert.equal(response.status, status); assert.equal(response.body.error.code, name); assert.doesNotMatch(JSON.stringify(response.body), /\/tmp\/|input.bin|normalized.wav|ffmpeg|stderr|private.wav/); };

test('WAV and controlled WebM/Opus normalize to verified private WAV, discard filenames, clean up before inference evidence', async context => {
  let observed = 0;
  const env = await setup(context, {}, { async onNormalized(audio) {
    observed++;
    const probe = await inspectMedia(audio.normalizedPath, 'wav', signal());
    assert.equal(probe.streams[0].sample_rate, '16000');
    assert.equal(probe.streams[0].channels, 1);
    assert.equal(probe.streams[0].codec_name, 'pcm_s16le');
    assert.equal(probe.format.format_name, 'wav');
    assert.equal(audio.durationMs, 200);
    assert.equal((await stat(audio.normalizedPath)).mode & 0o077, 0);
    assert.equal((await stat(join(audio.normalizedPath, '..'))).mode & 0o077, 0);
  } });
  const input = join(env.base, 'fixture.wav'), webm = join(env.base, 'fixture.webm');
  await writeFile(input, wav());
  await runMedia('/usr/bin/ffmpeg', ['-nostdin', '-v', 'error', '-i', input, '-c:a', 'libopus', '-f', 'webm', webm], signal());
  for (const [data, mime] of [[wav(), 'audio/x-wav'], [await readFile(webm), 'audio/webm;codecs=opus']]) {
    success(await post(env, multipart([part('audio', data, mime, '../../private.wav'), part('language', 'en')])));
    await assertClean(env);
  }
  assert.equal(observed, 2);
  const health = await (await fetch(`${env.origin}/api/v1/health`)).json();
  assert.equal(health.status, 'ready'); assert.equal(health.model.loaded, true);
  assert.equal(env.runtime.server.address().address, '127.0.0.1');
});

test('multipart contract rejects duplicate/missing/unknown/nested/oversized headers, wrong language, empty and malformed input', async context => {
  const env = await setup(context);
  const audio = part('audio', wav(), 'audio/wav'), language = part('language', 'en');
  for (const parts of [[audio], [language], [audio, audio, language], [audio, language, language],
    [audio, part('language', 'pt')], [audio, language, part('model', 'small.en')],
    [audio, language, part('url', 'https://example.com/audio.wav')],
    [part('audio', wav(), 'multipart/mixed'), language],
    [Buffer.from(`Content-Disposition: form-data; name="audio"; filename="x"\r\nX-Bad: ${'a'.repeat(2100)}\r\n\r\nx`), language]]) {
    const result = await post(env, multipart(parts));
    assert.ok([400, 415].includes(result.status)); await assertClean(env);
  }
  code(await post(env, multipart([part('audio', '', 'audio/wav'), language])), 422, 'AUDIO_EMPTY');
  code(await post(env, Buffer.from('malformed')), 400, 'INVALID_REQUEST');
  code(await post(env, multipart().subarray(0, -5)), 400, 'INVALID_REQUEST');
  code(await post(env, multipart(), { 'Content-Type': `multipart/form-data; boundary=${'a'.repeat(71)}` }), 400, 'INVALID_REQUEST');
  for (const origin of ['', 'null', 'https://example.com']) code(await post(env, multipart(), { Origin: origin }), 400, 'INVALID_REQUEST');
  await assertClean(env);
  success(await post(env));
});

test('actual content rejects random bytes, remote playlists, malformed WAV and video disguised as audio', async context => {
  const env = await setup(context);
  const video = join(env.base, 'video.webm');
  await runMedia('/usr/bin/ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=s=16x16:d=0.1', '-c:v', 'libvpx', '-f', 'webm', video], signal());
  for (const data of [Buffer.from('random bytes'), Buffer.from('#EXTM3U\nhttps://example.com/private.wav'), await readFile(video)]) {
    code(await post(env, multipart([part('audio', data, 'audio/webm'), part('language', 'en')])), 415, 'AUDIO_UNSUPPORTED');
    await assertClean(env);
  }
  const corrupt = Buffer.alloc(16); corrupt.write('RIFF'); corrupt.write('WAVE', 8);
  code(await post(env, multipart([part('audio', corrupt, 'audio/wav'), part('language', 'en')])), 422, 'AUDIO_DECODE_FAILED');
  await assertClean(env);
});

test('Content-Length precheck and chunked streaming budget return 413 and release slot without retaining audio', async context => {
  const env = await setup(context, { maxUploadBytes: 2048 });
  code(await post(env), 413, 'AUDIO_TOO_LARGE');
  const result = await new Promise((resolve, reject) => {
    const request = httpRequest(`${env.origin}/api/v1/transcribe`, { method: 'POST', headers: { Origin: env.origin, 'Content-Type': 'multipart/form-data; boundary=pte-test' } }, response => {
      let text = ''; response.on('data', bytes => { text += bytes; }); response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(text) }));
    });
    request.on('error', reject);
    request.write(Buffer.from('--pte-test\r\nContent-Disposition: form-data; name="audio"; filename="x"\r\nContent-Type: audio/wav\r\n\r\n'));
    for (let i = 0; i < 10; i++) request.write(Buffer.alloc(1024));
    request.end();
  });
  code(result, 413, 'AUDIO_TOO_LARGE'); await assertClean(env);
  success(await post(env, multipart([part('audio', wav(0.01), 'audio/wav'), part('language', 'en')])));
});

test('180-second limit and durationless WebM reject full overlong recordings without accepting truncation', async context => {
  const env = await setup(context);
  code(await post(env, multipart([part('audio', wav(181), 'audio/wav'), part('language', 'en')])), 413, 'AUDIO_TOO_LARGE');
  await assertClean(env);
  const short = await setup(context, { maxAudioSeconds: 1 });
  const webm = join(short.base, 'live.webm');
  await runMedia('/usr/bin/ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'sine=duration=3', '-c:a', 'libopus', '-live', '1', '-f', 'webm', webm], signal());
  const probe = await inspectMedia(webm, 'matroska', signal()); assert.equal(probe.format.duration, undefined);
  code(await post(short, multipart([part('audio', await readFile(webm), 'audio/webm'), part('language', 'en')])), 413, 'AUDIO_TOO_LARGE');
  await assertClean(short);
});

function partialUpload(env) {
  const request = httpRequest(`${env.origin}/api/v1/transcribe`, { method: 'POST', headers: { Origin: env.origin, 'Content-Type': 'multipart/form-data; boundary=pte-test' } });
  request.on('error', () => {});
  request.write('--pte-test\r\nContent-Disposition: form-data; name="audio"; filename="x"\r\nContent-Type: audio/wav\r\n\r\n');
  return request;
}

test('busy gate rejects concurrent work; abort and shutdown clean partial uploads and release the slot', async context => {
  const env = await setup(context);
  const request = partialUpload(env);
  await waitFor(async () => (await readdir(env.root)).some(name => name.startsWith('request-')));
  code(await post(env), 429, 'RUNTIME_BUSY');
  request.destroy(); await assertClean(env);
  success(await post(env));
  const shutdownRequest = partialUpload(env);
  await waitFor(async () => (await readdir(env.root)).some(name => name.startsWith('request-')));
  await env.runtime.close(); shutdownRequest.destroy(); await assertClean(env);
});

async function hangingDecoder(context, timeoutMs) {
  const base = await mkdtemp(join(tmpdir(), 'pte-decoder-stub-'));
  context.after(() => rm(base, { recursive: true, force: true }));
  const pidFile = join(base, 'pid');
  const executable = join(base, 'decoder');
  await writeFile(executable, `#!${process.execPath}\nimport { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(pidFile)}, String(process.pid));\nsetInterval(() => {}, 1000);\n`);
  await chmod(executable, 0o700);
  const env = await setup(context, {}, { preprocessOptions: { tools: { ffmpeg: executable, ffprobe: '/usr/bin/ffprobe' }, timeoutMs } });
  return { ...env, pidFile };
}

test('decoder timeout and preprocessing disconnect kill owned children, clean files and keep metadata usable', async context => {
  for (const abort of [false, true]) {
    const env = await hangingDecoder(context, abort ? 5000 : 500);
    const controller = new AbortController();
    const pending = fetch(`${env.origin}/api/v1/transcribe`, { method: 'POST', headers: { Origin: env.origin, 'Content-Type': 'multipart/form-data; boundary=pte-test' }, body: multipart(), signal: controller.signal });
    const handled = pending.catch(error => error);
    await waitFor(async () => { try { await stat(env.pidFile); return true; } catch { return false; } });
    const pid = Number(await readFile(env.pidFile, 'utf8'));
    if (abort) controller.abort();
    const result = await handled;
    if (abort) assert.equal(result.name, 'AbortError');
    else code({ status: result.status, body: await result.json() }, 504, 'INFERENCE_TIMEOUT');
    await assertClean(env);
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    code(await post(env, Buffer.from('bad')), 400, 'INVALID_REQUEST');
    assert.equal((await fetch(`${env.origin}/api/v1/health`)).status, 200);
  }
});

test('startup removes only generated stale entries; symlink targets and unrelated files survive; unsafe roots fail closed', async context => {
  const base = await mkdtemp(join(tmpdir(), 'pte-stale-test-'));
  context.after(() => rm(base, { recursive: true, force: true }));
  const port = await freePort();
  const parent = join(base, `pte-study-runtime-${process.getuid?.() ?? 'user'}`), root = join(parent, `port-${port}`);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const external = join(base, 'unrelated'); await mkdir(external); await writeFile(join(external, 'keep'), 'preserve');
  await mkdir(join(root, 'request-ABC123')); await writeFile(join(root, 'request-ABC123', 'input.bin'), 'stale');
  await symlink(external, join(root, 'request-ABC123', 'link'));
  await symlink(external, join(root, 'request-XYZ123'));
  await writeFile(join(root, 'unrelated.txt'), 'preserve');
  const runtime = await startRuntime({ ...defaults, port }, { tempBase: base });
  await runtime.close();
  assert.deepEqual(await readdir(root), ['unrelated.txt']);
  assert.equal(await readFile(join(external, 'keep'), 'utf8'), 'preserve');
  const badBase = join(base, 'bad'); await mkdir(badBase);
  await symlink(external, join(badBase, `pte-study-runtime-${process.getuid?.() ?? 'user'}`));
  await assert.rejects(createTempStore(port, badBase));
});

test('production subprocess preprocessing works with all outbound Node APIs disabled', async context => {
  const config = { ...defaults, port: await freePort() };
  const child = await launchRuntime(config, context); await child.ready();
  const env = { origin: `http://127.0.0.1:${config.port}` };
  success(await post(env));
  assert.equal(child.output().stderr, '');
  assert.doesNotMatch(child.output().stdout, /input.bin|normalized.wav|recording.wav/);
});


test('multipart delimiters split byte-by-byte stay bounded and high-bit language lookalikes are rejected', async context => {
  const base = await mkdtemp(join(tmpdir(), 'pte-parser-test-'));
  context.after(() => rm(base, { recursive: true, force: true }));
  const body = multipart([part('language', 'en'), part('audio', wav(0.001), 'audio/wav')]);
  const path = join(base, 'input.bin');
  await receiveAudio(Readable.from(Array.from(body, value => Buffer.from([value]))), path, 'pte-test', defaults, signal());
  assert.deepEqual(await readFile(path), wav(0.001));
  const binary = Buffer.concat([wav(0.001), Buffer.from('\r\n--pte-test-not-a-boundary')]);
  const binaryBody = multipart([part('audio', binary, 'audio/wav'), part('language', 'en')]);
  const binaryPath = join(base, 'binary.bin');
  await receiveAudio(Readable.from(Array.from(binaryBody, value => Buffer.from([value]))), binaryPath, 'pte-test', defaults, signal());
  assert.deepEqual(await readFile(binaryPath), binary);
  const env = await setup(context);
  code(await post(env, multipart([part('audio', wav(), 'audio/wav'), part('language', Buffer.from([0xe5, 0xee]))])), 400, 'INVALID_REQUEST');
  await assertClean(env);
});

test('default 12 MiB Content-Length budget rejects before an upload body or temporary request is received', async context => {
  const env = await setup(context);
  const result = await new Promise((resolve, reject) => {
    const request = httpRequest(`${env.origin}/api/v1/transcribe`, { method: 'POST', headers: { Origin: env.origin,
      'Content-Type': 'multipart/form-data; boundary=pte-test', 'Content-Length': defaults.maxUploadBytes + 1 } }, response => {
      let text = ''; response.on('data', bytes => { text += bytes; }); response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(text) }));
    });
    request.on('error', reject); request.end();
  });
  code(result, 413, 'AUDIO_TOO_LARGE'); await assertClean(env);
});

test('temporary namespace lock rejects a live owner and recovers only a confirmed dead process', async context => {
  const base = await mkdtemp(join(tmpdir(), 'pte-lock-test-'));
  context.after(() => rm(base, { recursive: true, force: true }));
  const port = await freePort();
  const first = await createTempStore(port, base);
  await assert.rejects(createTempStore(port, base), /in use/);
  await first.close();
  // Produce an actual exited process PID rather than guessing a nonexistent PID.
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, ['-e', '']);
  const pid = child.pid;
  await new Promise(resolve => child.once('close', resolve));
  const lock = join(first.root, 'instance.lock'); await mkdir(lock, { mode: 0o700 });
  await writeFile(join(lock, 'pid'), String(pid), { mode: 0o600 });
  await mkdir(join(first.root, 'request-ABC456')); await writeFile(join(first.root, 'request-ABC456', 'input.bin'), 'stale');
  const recovered = await createTempStore(port, base);
  assert.deepEqual(await readdir(first.root), ['instance.lock']);
  await recovered.close();
});

test('native process output is capped for stdout and stderr and protocol restrictions deny HTTP before network access', async context => {
  for (const stream of ['stdout', 'stderr']) {
    await assert.rejects(runMedia(process.execPath, ['-e', `process.${stream}.write('x'.repeat(131072)); setInterval(() => {}, 1000);`], signal()),
      error => error.code === 'AUDIO_DECODE_FAILED' && !error.message.includes('xxx'));
  }
  const { createServer } = await import('node:http');
  const { inputArguments } = await import('../src/media.mjs');
  let requests = 0;
  const server = createServer((_request, response) => { requests++; response.end(wav()); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise(resolve => server.close(resolve)));
  await assert.rejects(runMedia('/usr/bin/ffprobe', ['-v', 'error', ...inputArguments('wav', `http://127.0.0.1:${server.address().port}/audio.wav`), '-of', 'json'], signal()),
    error => error.code === 'AUDIO_DECODE_FAILED');
  assert.equal(requests, 0);
});
