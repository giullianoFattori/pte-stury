import test from 'node:test';
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { mkdtemp, writeFile, readFile, readdir, rm, symlink, chmod, unlink, mkdir, stat, copyFile, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { trustedRequest } from '../src/server.mjs';
import { loadConfig, validateConfig, RESOURCE_CEILINGS } from '../src/config.mjs';
import { receiveAudio } from '../src/multipart.mjs';
import { createTempStore } from '../src/temp.mjs';
import { extractTranscript, runWhisper } from '../src/whisper.mjs';
import { nativeEnvironment } from '../src/nativeProcess.mjs';
import { validateArtifactManifest, verifyArtifactManifest } from '../src/artifactManifest.mjs';
import { createHash } from 'node:crypto';
import { runMedia } from '../src/media.mjs';
import { launch } from '../../tools/runtime-hardening/processes.mjs';
import { startFixture, makeFixture, post, multipart } from '../../tools/runtime-hardening/fixture.mjs';

async function raw(port, wire) {
  const socket = connect(port, '127.0.0.1');
  let result = '';
  socket.on('data', bytes => { result += bytes; });
  socket.on('error', () => {});
  const closed = once(socket, 'close');
  const timer = setTimeout(() => socket.destroy(), 2500);
  await once(socket, 'connect'); socket.write(wire);
  await closed; clearTimeout(timer);
  return result;
}
async function clean(env) {
  for (let i = 0; i < 200; i++) {
    if (!(await readdir(env.root)).some(name => name.startsWith('request-'))) return;
    await delay(10);
  }
  throw new Error('Request data remained after cleanup.');
}
const safe = value => assert.doesNotMatch(JSON.stringify(value), /\/tmp\/|\/home\/|private.wav|stack|stderr|ggml-base|sha256/);

test('peer and forwarding headers never broaden IPv4 loopback trust', async () => {
  const config = await loadConfig();
  const host = `127.0.0.1:${config.port}`;
  for (const peer of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '192.168.1.2']) {
    const request = { rawHeaders: ['Host', host], headers: { host, 'x-forwarded-for': '127.0.0.1', forwarded: 'for=127.0.0.1' }, socket: { remoteAddress: peer } };
    assert.equal(trustedRequest(request, config), peer === '127.0.0.1');
  }
});

test('raw HTTP Host/Origin/Fetch Metadata, duplicate framing and parser attacks fail closed', async context => {
  const env = await startFixture(context), host = `127.0.0.1:${env.config.port}`;
  const requests = [
    ...['localhost:' + env.config.port, '127.0.0.1:1', 'rebind.example:' + env.config.port].map(value => `Host: ${value}\r\n`),
    `Host: ${host}\r\nHost: ${host}\r\n`,
    `Host: ${host}\r\nOrigin: ${env.origin}\r\nOrigin: ${env.origin}\r\n`,
    ...['null', 'https://evil.example'].map(value => `Host: ${host}\r\nOrigin: ${value}\r\n`),
    `Host: ${host}\r\nSec-Fetch-Site: cross-site\r\n`,
    `Host: ${host}\r\nContent-Length: 0\r\nContent-Length: 0\r\n`,
    `Host: ${host}\r\nContent-Length: 0\r\nContent-Length: 1\r\n`,
    `Host: ${host}\r\nContent-Length: 0\r\nTransfer-Encoding: chunked\r\n`,
    `Host: ${host}\r\nContent-Type: audio/wav\r\nContent-Type: audio/wav\r\n`,
    `Host: ${host}\r\nX-Large: ${'x'.repeat(9000)}\r\n`,
    `Host: ${host}\r\n${Array.from({ length: 33 }, (_, i) => `X-${i}: x\r\n`).join('')}`,
    `Host : ${host}\r\n`,
    `Host: ${host}\r\nExpect: unknown\r\n`,
    `Host: ${host}\r\nExpect: 100-continue\r\n`,
    `Host: ${host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n`
  ];
  for (const headers of requests) {
    const response = await raw(env.config.port, `GET /api/v1/health HTTP/1.1\r\n${headers}\r\n`);
    assert.match(response, /^HTTP\/1\.1 (400|404|417)/); safe(response);
    assert.match(response, /Cache-Control: no-store/i); assert.match(response, /X-Content-Type-Options: nosniff/i);
  }
  const malformed = await raw(env.config.port, `POST /api/v1/transcribe HTTP/1.1\r\nHost: ${host}\r\nOrigin: ${env.origin}\r\nContent-Type: multipart/form-data; boundary=hardening\r\nTransfer-Encoding: chunked\r\n\r\nNOTHEX\r\n`);
  assert.match(malformed, /^HTTP\/1\.1 400/);
  await clean(env);
  assert.equal((await fetch(env.origin + '/api/v1/health', { headers: { hOsT: host } })).status, 200);
  assert.equal((await fetch(env.origin + '/api/v1/transcribe', { method: 'POST' })).status, 400);
  assert.equal((await post(env)).status, 200);
});

test('exact routes and methods reject queries, path normalization and unsupported verbs', async context => {
  const env = await startFixture(context), host = `127.0.0.1:${env.config.port}`;
  for (const path of ['/api/v1/health?x=1', '/api/v1/transcribe?model=small.en', '/api/v1/transcribe/', '/api/v1/../version', '/api/v1/%2e%2e/version', '/api//v1/health']) {
    assert.match(await raw(env.config.port, `GET ${path} HTTP/1.1\r\nHost: ${host}\r\n\r\n`), /^HTTP\/1\.1 404/);
  }
  for (const route of ['health', 'version', 'transcribe']) {
    for (const method of ['HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE', 'TRACE', 'CONNECT']) {
      const response = await raw(env.config.port, `${method} /api/v1/${route} HTTP/1.1\r\nHost: ${host}\r\nOrigin: ${env.origin}\r\n\r\n`);
      assert.match(response, /^HTTP\/1\.1 (404|405)/);
    }
  }
});

test('deterministic multipart fuzz rejects header controls and duplicates while ignoring safe filenames', async context => {
  const env = await startFixture(context);
  const valid = multipart().toString('latin1');
  const cases = [valid.slice(0, -8), valid.replaceAll('\r\n', '\n'),
    valid.replace('Content-Type: audio/wav', 'Content-Type: multipart/mixed'),
    valid.replace('Content-Type: audio/wav', 'Content-Type: audio/wav\r\nContent-Type: audio/wav'),
    valid.replace('Content-Type: audio/wav', 'Content-Disposition: form-data; name="audio"; filename="x"\r\nContent-Type: audio/wav'),
    valid.replace('name="language"', 'name="expectedText"'),
    ...['a'.repeat(256), 'a\0b', 'a\x01b', 'a\x7fb', 'a\tb'].map(filename => valid.replace('private.wav', filename)),
    valid.replace('Content-Type: audio/wav', 'Bad\x01Header: x')];
  for (const body of cases) {
    const result = await post(env, Buffer.from(body, 'latin1'));
    assert.ok([400, 415].includes(result.status)); safe(result.body); await clean(env);
  }
  for (const filename of ['../../outside.wav', 'gravação.wav']) assert.equal((await post(env, multipart(undefined, filename))).status, 200);
  const base = await mkdtemp(join(tmpdir(), 'pte-boundary-fuzz-'));
  context.after(() => rm(base, { recursive: true, force: true }));
  const binary = Buffer.from('audio\r\n--hardening-notdelimiter\0binary');
  const path = join(base, 'input');
  const body = multipart(binary);
  await receiveAudio(Readable.from([...body].map(byte => Buffer.from([byte]))), path, 'hardening', env.config, new AbortController().signal);
  assert.deepEqual(await readFile(path), binary);
});

test('config limits, encoding, lookalikes, prototype keys and symlinks fail safely', async context => {
  const fixture = await makeFixture(); context.after(fixture.remove);
  const config = fixture.config, file = join(fixture.base, 'invalid.json');
  for (const [key, ceiling] of Object.entries(RESOURCE_CEILINGS)) {
    assert.equal(validateConfig({ ...config, [key]: ceiling })[key], ceiling);
    for (const value of [-1, 0.5, String(ceiling), ceiling + 1, Number.MAX_SAFE_INTEGER]) assert.throws(() => validateConfig({ ...config, [key]: value }));
  }
  for (const bytes of [Buffer.from('\ufeff' + JSON.stringify(config)), Buffer.from(JSON.stringify(config) + ' trailing'),
    Buffer.from('{bad'), Buffer.alloc(16385), Buffer.from([0xff]),
    Buffer.from(JSON.stringify({ ...config, hоst: '127.0.0.1' })), Buffer.from(JSON.stringify(config).replace('"host"', '"__proto__"'))]) {
    await writeFile(file, bytes); await assert.rejects(loadConfig(file));
  }
  await symlink(join(fixture.base, 'config.json'), join(fixture.base, 'link.json'));
  await assert.rejects(loadConfig(join(fixture.base, 'link.json')));
  await assert.rejects(loadConfig(fixture.base));
});

test('temp locks, permissions, stale limits and storage/cleanup faults fail closed', async context => {
  const fixture = await makeFixture(); context.after(fixture.remove);
  const root = fixture.root; await mkdir(root, { recursive: true, mode: 0o700 });
  const lock = join(root, 'instance.lock'); await mkdir(lock, { mode: 0o700 });
  await writeFile(join(lock, 'pid'), 'not-a-pid'); await assert.rejects(createTempStore(fixture.config.port, fixture.base));
  await rm(lock, { recursive: true }); await symlink(fixture.base, lock); await assert.rejects(createTempStore(fixture.config.port, fixture.base));
  await unlink(lock);
  for (let i = 0; i < 257; i++) await writeFile(join(root, `unrelated-${i}`), '');
  await assert.rejects(createTempStore(fixture.config.port, fixture.base), /entry limit/);
  await rm(root, { recursive: true }); await mkdir(root, { mode: 0o755 });
  await assert.rejects(createTempStore(fixture.config.port, fixture.base), /Unsafe/);
  if (process.getuid?.() !== 0) {
    await chmod(root, 0o500);
    await assert.rejects(createTempStore(fixture.config.port, fixture.base));
    await chmod(root, 0o700);
  }
  for (const mode of ['disk-full', 'cleanup']) {
    let active = false;
    const env = await startFixture(context, {}, { createTempStore: async (port, base) => {
      const store = await createTempStore(port, base);
      return { ...store, async create() {
        if (active && mode === 'disk-full') throw Object.assign(new Error('/private/disk'), { code: 'ENOSPC' });
        const files = await store.create();
        return { ...files, async remove() { await files.remove(); if (active) throw new Error('/private/cleanup'); } };
      } };
    } });
    assert.equal(env.runtime.state.status, 'ready');
    active = true;
    const response = await post(env); assert.ok([500, 503].includes(response.status)); safe(response.body);
    assert.equal(env.runtime.state.status, 'error'); await clean(env);
    assert.equal((await post(env)).status, 503);
  }
});

test('model and executable mutations require restart without partial transcript success', async context => {
  for (const kind of ['truncate', 'contents', 'replace', 'symlink', 'engine-truncate', 'engine-replace', 'engine-symlink', 'engine-permissions', 'engine-metadata']) {
    const env = await startFixture(context);
    const path = kind.startsWith('engine') ? env.executable : env.modelPath;
    if (kind.endsWith('permissions')) await chmod(path, 0o600);
    else if (kind.endsWith('metadata')) await chmod(path, 0o500);
    else if (kind.endsWith('replace')) { const copy = path + '.copy'; await copyFile(path, copy); await unlink(path); await copyFile(copy, path); }
    else if (kind.endsWith('symlink')) { const copy = path + '.copy'; await copyFile(path, copy); await unlink(path); await symlink(copy, path); }
    else if (kind === 'contents') { const bytes = await readFile(path); bytes[0] ^= 1; await writeFile(path, bytes); }
    else await writeFile(path, '');
    const response = await post(env); assert.equal(response.status, 503); safe(response.body);
    assert.equal(response.body.text, undefined); assert.equal(env.runtime.state.status, 'error'); assert.equal(env.runtime.state.modelLoaded, false);
    await clean(env);
  }
});

test('native output rejects controls, decoration and excessive text but retains ordinary Unicode and JSON-like words', async () => {
  for (const text of ['x\0y', '\x1b[31mred', 'text\x7f', '[00:00:00.000 --> 00:00:01.000] hi', 'main: secret', 'ggml_init: secret']) assert.throws(() => extractTranscript(text));
  assert.equal(extractTranscript('behaviour → 9, café.'), 'behaviour → 9, café.');
  assert.equal(extractTranscript('{"word":"nine"}'), '{"word":"nine"}');
  const fixture = await makeFixture();
  try {
    for (const script of ["process.stdout.write(Buffer.from([255,254]));", "process.stdout.write('x'.repeat(131072));", "process.stderr.write('x'.repeat(131072));"]) {
      await assert.rejects(runWhisper(process.execPath, ['-e', script], new AbortController().signal, 1000));
    }
  } finally { await fixture.remove(); }
  assert.ok(!Object.keys(nativeEnvironment()).some(key => /PATH|NODE_OPTIONS|LD_|PROXY|PTE/.test(key)));
});

test('inference crash and hard timeout clean children and release the slot', async context => {
  const env = await startFixture(context, { inferenceTimeoutMs: 300 });
  await env.mode('crash'); assert.equal((await post(env)).status, 500); await clean(env);
  assert.equal(env.runtime.state.status, 'ready');
  await env.mode('hang'); assert.equal((await post(env)).status, 504); await clean(env);
  const pid = await env.pid(); assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  await env.mode('ok'); assert.equal((await post(env)).status, 200);
});

test('packaged artifact inventory requires SHA-256 and detects corruption or symlinks', async context => {
  const fixture = await makeFixture(); context.after(fixture.remove);
  const bytes = await readFile(fixture.modelPath);
  const manifest = { manifestVersion: 1, runtimeVersion: '0.1.0', platform: 'linux', arch: 'x64', artifacts: [
    { id: 'base.en', kind: 'model', path: 'ggml-base.en.bin', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } ] };
  assert.equal(await verifyArtifactManifest(manifest, fixture.base), true);
  for (const change of [{ sha256: 'a'.repeat(40) }, { path: '../escape' }, { path: '/absolute' }, { size: -1 }]) {
    assert.throws(() => validateArtifactManifest({ ...manifest, artifacts: [{ ...manifest.artifacts[0], ...change }] }));
  }
  assert.throws(() => validateArtifactManifest({ ...manifest, artifacts: [...manifest.artifacts, ...manifest.artifacts] }));
  await writeFile(fixture.modelPath, Buffer.alloc(bytes.length));
  await assert.rejects(verifyArtifactManifest(manifest, fixture.base), error => error.code === 'ARTIFACT_INTEGRITY_FAILED' && !error.message.includes(fixture.base));
  await unlink(fixture.modelPath); await symlink(fixture.executable, fixture.modelPath);
  await assert.rejects(verifyArtifactManifest(manifest, fixture.base));
});

test('native termination kills owned descendants before resolving cancellation', async context => {
  const fixture = await makeFixture(); context.after(fixture.remove);
  const script = join(fixture.base, 'tree.mjs'), descendantFile = join(fixture.base, 'descendant');
  await writeFile(script, `import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';\nconst child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});writeFileSync(${JSON.stringify(descendantFile)},String(child.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`);
  const controller = new AbortController();
  const result = runWhisper(process.execPath, [script], controller.signal, 3000).catch(error => error);
  for (let i = 0; i < 200; i++) { try { await stat(descendantFile); break; } catch { await delay(10); } }
  const descendant = Number(await readFile(descendantFile, 'utf8'));
  controller.abort(); await result;
  assert.throws(() => process.kill(descendant, 0), { code: 'ESRCH' });
});

test('fatal exceptions and unhandled rejections emit safe logs and exit nonzero', async context => {
  for (const mode of ['uncaught', 'rejection']) {
    const fixture = await makeFixture(); context.after(fixture.remove);
    const runtime = await launch(fixture, mode); context.after(runtime.stop);
    assert.equal((await runtime.exited).code, 1);
    const { output, diagnostics } = runtime.output();
    assert.match(output, /runtime fatal/); assert.match(output, /shutdown complete/);
    assert.doesNotMatch(output + diagnostics, /private|\/home\/|Error:|\.mjs:/);
    assert.deepEqual(await readdir(fixture.root), []);
  }
});

test('extreme sample rate, channels and compressed amplification reject before inference', async context => {
  const env = await startFixture(context, { maxAudioSeconds: 1 });
  for (const mutation of [bytes => { bytes.writeUInt32LE(200000, 24); bytes.writeUInt32LE(400000, 28); },
    bytes => { bytes.writeUInt16LE(9, 22); bytes.writeUInt16LE(18, 32); }, bytes => { bytes.writeUInt16LE(6, 20); }]) {
    const body = multipart(); mutation(body.subarray(body.indexOf('RIFF')));
    const response = await post(env, body); assert.ok([415, 422].includes(response.status)); await clean(env);
  }
  const compressed = join(env.base, 'compressed.ogg');
  await runMedia('/usr/bin/ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'sine=duration=3', '-c:a', 'libopus', compressed], new AbortController().signal);
  const body = multipart(await readFile(compressed));
  const response = await post(env, body); assert.equal(response.status, 413); await clean(env);
  assert.equal(env.runtime.state.status, 'ready');
});

test('decoder replacement or symlink after readiness fails closed', async context => {
  const fixture = await makeFixture(); context.after(fixture.remove);
  const tools = { ffprobe: join(fixture.base, 'ffprobe'), ffmpeg: join(fixture.base, 'ffmpeg') };
  await copyFile('/usr/bin/ffprobe', tools.ffprobe); await copyFile('/usr/bin/ffmpeg', tools.ffmpeg);
  const env = await startFixture(context, {}, { preprocessOptions: { tools } });
  assert.equal(env.runtime.state.status, 'ready');
  await chmod(tools.ffmpeg, 0o600);
  const response = await post(env); assert.equal(response.status, 503); safe(response.body);
  assert.equal(env.runtime.state.status, 'error'); await clean(env);
  // A fresh service also refuses a decoder symlink at initialization.
  await unlink(tools.ffprobe); await symlink('/usr/bin/ffprobe', tools.ffprobe);
  const other = await startFixture(context, {}, { preprocessOptions: { tools } });
  assert.equal(other.runtime.state.status, 'error');
});

test('rapid metadata and invalid uploads do not occupy or poison the transcription slot', async context => {
  const env = await startFixture(context);
  for (let i = 0; i < 50; i++) {
    assert.equal((await fetch(env.origin + '/api/v1/health')).status, 200);
    const invalid = await post(env, Buffer.from('invalid multipart')); assert.equal(invalid.status, 400);
  }
  assert.equal(env.runtime.state.status, 'ready'); await clean(env);
  assert.equal((await post(env)).status, 200);
});

test('partial upload write failure removes already-written private bytes and marks non-ready', async context => {
  const env = await startFixture(context);
  const handle = await open(join(env.base, 'prototype-probe'), 'wx');
  const prototype = Object.getPrototypeOf(handle), original = prototype.write;
  await handle.close();
  context.mock.method(prototype, 'write', async function (...args) {
    await original.apply(this, args);
    throw Object.assign(new Error('/private/disk full'), { code: 'ENOSPC' });
  });
  const response = await post(env);
  context.mock.restoreAll();
  assert.equal(response.status, 500); safe(response.body); assert.equal(response.body.text, undefined);
  await clean(env); assert.equal(env.runtime.state.status, 'error');
  assert.equal((await post(env)).status, 503);
});
