import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { SpeechToTextError } from '../src/domain/speech/types.ts';
import {
  SPEECH_RUNTIME_API_VERSION, SPEECH_RUNTIME_ERROR_CODES, SpeechRuntimeContractError,
  parseSpeechRuntimeHealth, parseSpeechRuntimeVersion, parseSpeechRuntimeTranscription,
  parseSpeechRuntimeErrorResponse, getSpeechRuntimeAvailability, mapSpeechRuntimeError,
  validateTranscriptionResultMetadata, toTranscriptionResult,
} from '../src/domain/speech/runtimeTypes.ts';

const metadata = { runtimeVersion: '0.1.0', apiVersion: 1, engine: 'whisper.cpp', engineVersion: '1.8.3' };
const health = { ...metadata, status: 'ready', model: { id: 'base.en', loaded: true }, processedLocally: true };
const version = { ...metadata, build: { platform: 'linux', arch: 'x64' } };
const transcript = { text: 'The university library will remain open.', language: 'en', engine: 'whisper.cpp',
  model: 'base.en', processedLocally: true, timing: { audioMs: 5940, inferenceMs: 2211, totalMs: 2447 } };
const rejectsContract = operation => assert.throws(operation, error =>
  error instanceof SpeechRuntimeContractError && error.code === 'INTERNAL_ERROR');

test('valid health/version metadata is parsed into detached known fields', () => {
  assert.equal(SPEECH_RUNTIME_API_VERSION, 1);
  const parsedHealth = parseSpeechRuntimeHealth({ ...health, filesystemPath: '/private/model.bin' });
  const parsedVersion = parseSpeechRuntimeVersion({ ...version, secret: 'not forwarded' });
  assert.deepEqual(parsedHealth, health);
  assert.deepEqual(parsedVersion, version);
  assert.notEqual(parsedHealth.model, health.model);
  assert.notEqual(parsedVersion.build, version.build);
  assert.equal(getSpeechRuntimeAvailability(parsedHealth), 'ready');
});

test('API compatibility is required regardless of runtime or engine patch versions', () => {
  for (const apiVersion of [2, 3]) {
    for (const parse of [parseSpeechRuntimeHealth, parseSpeechRuntimeVersion]) {
      assert.throws(() => parse({ ...health, ...version, apiVersion }), error =>
        error instanceof SpeechRuntimeContractError && error.code === 'RUNTIME_INCOMPATIBLE');
    }
    assert.equal(getSpeechRuntimeAvailability({ ...health, apiVersion }), 'incompatible');
  }
  assert.equal(getSpeechRuntimeAvailability({ ...health, engine: 'remote-service' }), 'incompatible');
  assert.equal(getSpeechRuntimeAvailability({ ...health, runtimeVersion: '0.2.3-beta.1+linux', engineVersion: '1.9.0' }), 'ready');
});

test('availability distinguishes unreachable, starting and unusable states without browser pack semantics', () => {
  assert.equal(getSpeechRuntimeAvailability(null), 'unavailable');
  assert.equal(getSpeechRuntimeAvailability({ ...health, status: 'starting', model: { id: 'base.en', loaded: false } }), 'starting');
  for (const status of ['error', 'degraded']) {
    const value = { ...health, status, model: { id: 'base.en', loaded: false },
      error: { code: 'MODEL_UNAVAILABLE', message: 'The model is not loaded.' } };
    assert.equal(getSpeechRuntimeAvailability(value), 'error');
    assert.deepEqual(parseSpeechRuntimeHealth(value).error, value.error);
  }
  for (const value of [undefined, {}, [], 'ready', { ...health, status: 'downloadable' }]) {
    assert.equal(getSpeechRuntimeAvailability(value), 'error');
  }
});

test('health never reports ready for an unloaded model, error or non-local evidence', () => {
  for (const change of [
    { model: { id: 'base.en', loaded: false } }, { model: { id: 'base.en', loaded: 'true' } },
    { processedLocally: false }, { processedLocally: 'true' },
    { error: { code: 'MODEL_UNAVAILABLE', message: 'Missing model' } },
    { model: { id: '/home/user/model.bin', loaded: true } },
  ]) rejectsContract(() => parseSpeechRuntimeHealth({ ...health, ...change }));
});

test('required metadata rejects malformed versions, build data and nonnumeric API claims', () => {
  for (const value of [null, [], {}, 'version']) rejectsContract(() => parseSpeechRuntimeVersion(value));
  for (const apiVersion of [undefined, '1', 0, 1.1, NaN, Infinity]) {
    rejectsContract(() => parseSpeechRuntimeVersion({ ...version, apiVersion }));
  }
  for (const runtimeVersion of ['', 'v0.1.0', '0.1', '01.1.0', '0.1.0-01', '/native/path']) {
    rejectsContract(() => parseSpeechRuntimeVersion({ ...version, runtimeVersion }));
  }
  rejectsContract(() => parseSpeechRuntimeVersion({ ...version, engineVersion: null }));
  rejectsContract(() => parseSpeechRuntimeVersion({ ...version, build: { platform: 'unknown', arch: 'x64' } }));
  rejectsContract(() => parseSpeechRuntimeVersion({ ...version, build: { platform: 'linux', arch: '/private' } }));
});

test('Whisper response maps to the expanded domain engine with optional evidence and no fabricated confidence', () => {
  const source = { ...transcript, confidence: 1, words: [{ text: 'invented' }], nativePath: '/private/model.bin' };
  const result = toTranscriptionResult(source);
  assert.deepEqual(result, { text: transcript.text, language: 'en', engine: 'whisper.cpp', model: 'base.en',
    processedLocally: true, audioMs: 5940, inferenceMs: 2211, totalMs: 2447 });
  assert.equal('confidence' in result, false);
  assert.equal('words' in result, false);
  assert.deepEqual(parseSpeechRuntimeTranscription(transcript), transcript);
  assert.notEqual(parseSpeechRuntimeTranscription(transcript).timing, transcript.timing);
  validateTranscriptionResultMetadata(result);
  validateTranscriptionResultMetadata({ engine: 'browser-on-device' });
  validateTranscriptionResultMetadata({ engine: 'whisper.cpp' });
});

test('required runtime timing rejects missing, negative, nonfinite, fractional and unsafe values', () => {
  for (const field of ['audioMs', 'inferenceMs', 'totalMs']) {
    for (const invalid of [undefined, null, -1, NaN, Infinity, -Infinity, '2211', 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      rejectsContract(() => parseSpeechRuntimeTranscription({ ...transcript, timing: { ...transcript.timing, [field]: invalid } }));
    }
  }
  rejectsContract(() => parseSpeechRuntimeTranscription({ ...transcript, timing: null }));
  rejectsContract(() => parseSpeechRuntimeTranscription({ ...transcript, timing: { ...transcript.timing, totalMs: 1000 } }));
});

test('optional domain timing obeys the same integer/finite rules when present', () => {
  for (const field of ['audioMs', 'inferenceMs', 'totalMs']) {
    for (const invalid of [null, -1, NaN, Infinity, -Infinity, '2211', 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      rejectsContract(() => validateTranscriptionResultMetadata({ engine: 'whisper.cpp', [field]: invalid }));
    }
    validateTranscriptionResultMetadata({ engine: 'browser-on-device', [field]: 0 });
    validateTranscriptionResultMetadata({ engine: 'whisper.cpp', [field]: undefined });
  }
  rejectsContract(() => validateTranscriptionResultMetadata({ engine: 'whisper.cpp', inferenceMs: 2, totalMs: 1 }));
  assert.equal(toTranscriptionResult({ ...transcript, timing: { audioMs: 0, inferenceMs: 0, totalMs: 0 } }).totalMs, 0);
});

test('transcript parser rejects unusable text, non-local engines and path-like model metadata', () => {
  for (const change of [
    { text: '' }, { text: '  ' }, { text: null }, { language: 'en-AU' }, { engine: 'browser-on-device' },
    { processedLocally: false }, { processedLocally: undefined }, { model: '' },
    { model: '../base.en' }, { model: 'https://example.com/model' }, { model: 'x'.repeat(65) },
  ]) rejectsContract(() => toTranscriptionResult({ ...transcript, ...change }));
  assert.equal(toTranscriptionResult({ ...transcript, model: 'small.en' }).model, 'small.en');
});

test('every runtime error has an explicit safe domain mapping', () => {
  const expected = {
    RUNTIME_UNAVAILABLE: 'local-unavailable', RUNTIME_STARTING: 'local-unavailable', MODEL_UNAVAILABLE: 'local-unavailable',
    AUDIO_EMPTY: 'no-speech', AUDIO_TOO_LARGE: 'recognition-failed', AUDIO_UNSUPPORTED: 'audio-track-unavailable',
    AUDIO_DECODE_FAILED: 'audio-track-unavailable', NO_SPEECH: 'no-speech', INFERENCE_TIMEOUT: 'recognition-failed',
    INFERENCE_FAILED: 'recognition-failed', REQUEST_CANCELLED: 'cancelled', RUNTIME_INCOMPATIBLE: 'unsupported',
    INTERNAL_ERROR: 'recognition-failed', INVALID_REQUEST: 'recognition-failed', RUNTIME_BUSY: 'recognition-failed',
  };
  assert.deepEqual(new Set(SPEECH_RUNTIME_ERROR_CODES), new Set(Object.keys(expected)));
  for (const [code, mappedCode] of Object.entries(expected)) {
    const parsed = parseSpeechRuntimeErrorResponse({ error: { code, message: 'native exception /home/private/recording.wav' } });
    const error = mapSpeechRuntimeError(parsed.error.code);
    assert.ok(error instanceof SpeechToTextError);
    assert.equal(error.code, mappedCode);
    assert.ok(error.message.length > 0);
    assert.doesNotMatch(error.message, /native exception|\/home\/private/);
  }
  assert.equal(mapSpeechRuntimeError('RUNTIME_INCOMPATIBLE').message, 'Runtime version is incompatible with this app.');
});

test('unknown/malformed error responses fail closed with a safe contract error', () => {
  for (const value of [null, {}, { error: null }, { error: { code: 'SHELL_FAILED', message: '/private' } },
    { error: { code: 'INTERNAL_ERROR' } }, { error: { code: 'NO_SPEECH', message: '' } }]) {
    rejectsContract(() => parseSpeechRuntimeErrorResponse(value));
  }
});

test('example configuration records runtime-owned loopback limits without machine paths', async () => {
  const config = JSON.parse(await readFile(new URL('../runtime/config/runtime.example.json', import.meta.url), 'utf8'));
  assert.equal(config.apiVersion, SPEECH_RUNTIME_API_VERSION);
  assert.equal(config.host, '127.0.0.1');
  assert.ok(config.port >= 1 && config.port <= 65535);
  assert.equal(config.model, 'base.en');
  assert.equal(config.maxUploadBytes, 12 * 1024 * 1024);
  assert.equal(config.maxAudioSeconds, 180);
  assert.equal(config.inferenceTimeoutMs, 60000);
  assert.equal(config.maxConcurrentTranscriptions, 1);
  assert.ok(Object.values(config).every(value => typeof value !== 'string' || !value.includes('/')));
});
