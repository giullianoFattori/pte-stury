import { open, lstat, access, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { runNative, NATIVE_OUTPUT_LIMIT } from './nativeProcess.mjs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { TextDecoder } from 'node:util';
import { AudioRequestError } from './errors.mjs';
import { ENGINE_VERSION, ENGINE_REVISION } from './version.mjs';

export const MODEL_MANIFEST = Object.freeze({
  'base.en': Object.freeze({ filename: 'ggml-base.en.bin', minBytes: 147964211, maxBytes: 147964211,
    sha1: '137c40403d78fd54d454da0f9bd998f78703390c',
    sha256: 'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002' }),
  'small.en': Object.freeze({ filename: 'ggml-small.en.bin', minBytes: 450000000, maxBytes: 520000000,
    sha1: 'db8a495a91d927739e50b3fc1cc4c6b8f6c2d022' }),
});
export const DEVELOPMENT_ARTIFACTS = Object.freeze({
  executable: fileURLToPath(new URL('../../.local-runtime/whisper.cpp/build/bin/whisper-cli', import.meta.url)),
  buildInfo: fileURLToPath(new URL('../../.local-runtime/whisper.cpp/build/whisper-config.cmake', import.meta.url)),
  modelRoot: fileURLToPath(new URL('../../.local-runtime/models/', import.meta.url)),
  models: MODEL_MANIFEST,
});
export const WHISPER_OUTPUT_LIMIT = NATIVE_OUTPUT_LIMIT;
const unavailableEngine = () => new AudioRequestError(503, 'RUNTIME_UNAVAILABLE', 'The local Whisper engine is unavailable.');
const unavailableModel = () => new AudioRequestError(503, 'MODEL_UNAVAILABLE', 'The local speech model is unavailable or invalid.');
const inferenceFailed = () => new AudioRequestError(500, 'INFERENCE_FAILED', 'Local speech recognition failed.');

export function whisperArguments(modelPath, normalizedPath) {
  return ['--model', modelPath, '--file', normalizedPath, '--language', 'en', '--threads', '4',
    '--no-gpu', '--no-prints', '--no-timestamps', '--suppress-nst'];
}

export async function runWhisper(executable, args, signal, timeoutMs) {
  const output = await runNative(executable, args, { signal, timeoutMs,
    unavailable: unavailableEngine, failed: inferenceFailed,
    timeout: () => new AudioRequestError(504, 'INFERENCE_TIMEOUT', 'Local speech recognition timed out.') });
  try { return new TextDecoder('utf-8', { fatal: true }).decode(output); }
  catch { throw inferenceFailed(); }
}

export function extractTranscript(output) {
  if (typeof output !== 'string' || Buffer.byteLength(output, 'utf8') > WHISPER_OUTPUT_LIMIT || [...output].some(char => {
    const code = char.codePointAt(0);
    return code < 9 || code === 11 || code === 12 || (code > 13 && code < 32) || (code >= 127 && code <= 159);
  })
    || /\[\d{2}:\d{2}:\d{2}\.\d{3}\s*-->/.test(output)
    || /^\s*(?:whisper_[a-z0-9_]+|ggml_[a-z0-9_]+|main|system_info):/m.test(output)) throw inferenceFailed();
  const text = output.trim();
  if (!text || /^\[BLANK_AUDIO\]$/i.test(text)) throw new AudioRequestError(422, 'NO_SPEECH', 'No usable speech was recognized.');
  return text;
}

function identity(stat) { return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':'); }
async function regularFile(path) {
  const value = await lstat(path);
  if (!value.isFile() || value.isSymbolicLink()) throw new Error('Expected regular artifact');
  return value;
}
async function requireUnchanged(path, expected, unavailable) {
  try { if (identity(await regularFile(path)) !== expected) throw unavailable(); }
  catch { throw unavailable(); }
}
async function verifyBuild(path) {
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 4096) throw unavailableEngine();
    const bytes = Buffer.alloc(4097);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    const text = bytes.subarray(0, bytesRead).toString('utf8');
    if (bytesRead > 4096 || !text.includes(`set(WHISPER_VERSION      ${ENGINE_VERSION})`)
      || !text.includes(`set(WHISPER_BUILD_COMMIT ${ENGINE_REVISION.slice(0, 7)})`)) throw unavailableEngine();
  } finally { await file.close(); }
}
async function verifyModel(path, manifest, signal) {
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const before = await file.stat();
    if (!before.isFile() || before.size < manifest.minBytes || before.size > manifest.maxBytes) throw unavailableModel();
    const sha1 = createHash('sha1'), sha256 = createHash('sha256'), buffer = Buffer.alloc(1048576);
    let position = 0;
    while (position <= manifest.maxBytes) {
      signal.throwIfAborted();
      const { bytesRead } = await file.read(buffer, 0, buffer.length, position);
      if (!bytesRead) break;
      sha1.update(buffer.subarray(0, bytesRead)); sha256.update(buffer.subarray(0, bytesRead)); position += bytesRead;
    }
    if (position !== before.size || sha1.digest('hex') !== manifest.sha1
      || (manifest.sha256 && sha256.digest('hex') !== manifest.sha256)
      || identity(await file.stat()) !== identity(before)) throw unavailableModel();
    return identity(before);
  } finally { await file.close(); }
}

function startupWav() {
  const data = Buffer.alloc(44 + 32000); // One second of synthetic silence, no learner content.
  data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(16000, 24); data.writeUInt32LE(32000, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(32000, 40);
  return data;
}

// artifacts is an internal build/test dependency, never an HTTP/config option.
export async function createWhisperService({ modelId, temp, signal, timeoutMs, artifacts = DEVELOPMENT_ARTIFACTS }) {
  signal.throwIfAborted();
  let engineIdentity, modelIdentity;
  if (!Object.hasOwn(MODEL_MANIFEST, modelId)) throw unavailableModel();
  const manifest = artifacts.models[modelId];
  if (!manifest || manifest.filename !== MODEL_MANIFEST[modelId].filename) throw unavailableModel();
  const modelPath = join(artifacts.modelRoot, manifest.filename);
  try {
    engineIdentity = identity(await regularFile(artifacts.executable));
    await access(artifacts.executable, constants.X_OK);
    await verifyBuild(artifacts.buildInfo);
  } catch { throw unavailableEngine(); }
  try { modelIdentity = await verifyModel(modelPath, manifest, signal); }
  catch { if (signal.aborted) throw signal.reason; throw unavailableModel(); }
  let files;
  try {
    files = await temp.create();
    await writeFile(files.normalizedPath, startupWav(), { flag: 'wx', mode: 0o600 });
    // Exit 0 with a real supported WAV proves model initialization and an inference
    // path; startup stdout is discarded and no transcript/file output flags exist.
    await runWhisper(artifacts.executable, whisperArguments(modelPath, files.normalizedPath), signal, timeoutMs);
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (error.code === 'RUNTIME_UNAVAILABLE') throw error;
    throw unavailableModel();
  } finally { await files?.remove(); }
  await requireUnchanged(modelPath, modelIdentity, unavailableModel);
  await requireUnchanged(artifacts.executable, engineIdentity, unavailableEngine);
  return Object.freeze({ async transcribeNormalizedAudio({ normalizedPath, modelId: requestedModel, signal: cancellation }) {
    cancellation.throwIfAborted();
    if (requestedModel !== modelId) throw unavailableModel();
    await requireUnchanged(modelPath, modelIdentity, unavailableModel);
    await requireUnchanged(artifacts.executable, engineIdentity, unavailableEngine);
    const started = performance.now();
    const text = extractTranscript(await runWhisper(artifacts.executable, whisperArguments(modelPath, normalizedPath), cancellation, timeoutMs));
    cancellation.throwIfAborted();
    await requireUnchanged(modelPath, modelIdentity, unavailableModel);
    await requireUnchanged(artifacts.executable, engineIdentity, unavailableEngine);
    return { text, inferenceMs: Math.round(performance.now() - started) };
  } });
}
