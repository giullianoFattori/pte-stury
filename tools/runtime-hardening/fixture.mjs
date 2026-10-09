// Controlled test/stress dependencies only; never imported by runtime:start.
import { mkdtemp, writeFile, chmod, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ENGINE_VERSION, ENGINE_REVISION } from '../../runtime/src/version.mjs';
import { loadConfig } from '../../runtime/src/config.mjs';
import { freePort } from '../../runtime/tests/helpers.mjs';
import { startRuntime } from '../../runtime/src/server.mjs';
import { createWhisperService } from '../../runtime/src/whisper.mjs';

export function controlledWav(seconds = 0.1) {
  const samples = Math.round(seconds * 16000), bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) bytes.writeInt16LE(Math.round(4000 * Math.sin(i * Math.PI * 2 * 440 / 16000)), 44 + i * 2);
  return bytes;
}
export function multipart(audio = controlledWav(), filename = 'private.wav', boundary = 'hardening') {
  return Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="${filename}"\r\nContent-Type: audio/wav\r\n\r\n`), audio,
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nen\r\n--${boundary}--\r\n`)]);
}
export async function makeFixture() {
  const base = await mkdtemp(join(tmpdir(), 'pte-hardening-'));
  const executable = join(base, 'controlled-cli.mjs'), modelPath = join(base, 'ggml-base.en.bin'), buildInfo = join(base, 'build.cmake');
  const model = Buffer.from('synthetic test artifact, never learner speech');
  await writeFile(modelPath, model);
  await writeFile(buildInfo, `set(WHISPER_VERSION      ${ENGINE_VERSION})\nset(WHISPER_BUILD_COMMIT ${ENGINE_REVISION.slice(0, 7)})\n`);
  await writeFile(executable, `#!${process.execPath}\nimport {readFile,writeFile} from 'node:fs/promises';\nconst root=new URL('.',import.meta.url);\nconst mode=await readFile(new URL('mode',root),'utf8');\nawait writeFile(new URL('pid',root),String(process.pid));\nif(mode==='hang') {process.on('SIGTERM',()=>{});setInterval(()=>{},1000);} else if(mode==='crash'){process.stderr.write('private /home/learner/audio.wav');process.exitCode=7;} else process.stdout.write('Controlled local transcript.');\n`);
  await chmod(executable, 0o700); await writeFile(join(base, 'mode'), 'ok');
  const artifacts = { executable, modelRoot: base, buildInfo, models: { 'base.en': { filename: 'ggml-base.en.bin', minBytes: model.length, maxBytes: model.length,
    sha1: createHash('sha1').update(model).digest('hex'), sha256: createHash('sha256').update(model).digest('hex') } } };
  const config = { ...await loadConfig(), port: await freePort() };
  await writeFile(join(base, 'config.json'), JSON.stringify(config));
  await writeFile(join(base, 'artifacts.json'), JSON.stringify(artifacts));
  return { base, artifacts, config, origin: `http://127.0.0.1:${config.port}`, modelPath, executable,
    root: join(base, `pte-study-runtime-${process.getuid?.() ?? 'user'}`, `port-${config.port}`),
    mode: value => writeFile(join(base, 'mode'), value), remove: () => rm(base, { recursive: true, force: true }),
    pid: async () => Number(await readFile(join(base, 'pid'), 'utf8')) };
}
export async function startFixture(context, changes = {}, options = {}) {
  const fixture = await makeFixture();
  fixture.config = { ...fixture.config, ...changes };
  const runtime = await startRuntime(fixture.config, { tempBase: fixture.base,
    initializeEngine: opts => createWhisperService({ ...opts, artifacts: fixture.artifacts }), ...options });
  context.after(async () => { await runtime.close(); await fixture.remove(); });
  await runtime.initialized;
  return { ...fixture, runtime };
}
export async function post(fixture, body = multipart(), signal) {
  const response = await fetch(fixture.origin + '/api/v1/transcribe', { method: 'POST', headers: { Origin: fixture.origin,
    'Content-Type': 'multipart/form-data; boundary=hardening' }, body, signal });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
