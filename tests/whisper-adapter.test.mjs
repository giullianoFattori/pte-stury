import test from 'node:test';
import assert from 'node:assert/strict';
import { WhisperCppSpeechToTextAdapter } from '../src/infrastructure/speech/WhisperCppSpeechToTextAdapter.ts';
import { getSpeechRuntimeHealth, transcribeWithSpeechRuntime } from '../src/infrastructure/speech/speechRuntimeClient.ts';
const health = { status: 'ready', runtimeVersion: '0.1.0', apiVersion: 1, engine: 'whisper.cpp',
  engineVersion: '1.8.3', model: { id: 'base.en', loaded: true }, processedLocally: true };
const result = { text: 'Hello world.', language: 'en', engine: 'whisper.cpp', model: 'base.en',
  processedLocally: true, timing: { audioMs: 2000, inferenceMs: 1000, totalMs: 1200 } };
const adapter = new WhisperCppSpeechToTextAdapter();
const options = { language: 'en-AU' };
function mock(context, payload, status = 200) {
  context.mock.method(globalThis, 'fetch', async () => Response.json(payload, { status }));
}
test('health mapping rejects incompatible/malformed health and never offers installation', async context => {
  assert.equal(adapter.installLanguage, undefined);
  assert.equal(adapter.provider.supportsLanguageInstall, false);
  for (const [payload, expected] of [
    [health, 'available'],
    [{ ...health, status: 'starting', model: { id: 'base.en', loaded: false } }, 'unavailable'],
    [{ ...health, status: 'error', model: { id: 'base.en', loaded: false } }, 'unavailable'],
    [{ ...health, apiVersion: 2 }, 'unsupported'],
    [{ ...health, engine: 'other-engine' }, 'unsupported'],
    [{ ...health, processedLocally: false }, 'unavailable'],
  ]) {
    mock(context, payload);
    assert.equal(await adapter.checkAvailability(options), expected);
    context.mock.restoreAll();
  }
  context.mock.method(globalThis, 'fetch', async () => { throw new TypeError('private network diagnostic'); });
  assert.equal(await adapter.checkAvailability(options), 'unavailable');
  await assert.rejects(adapter.transcribe(new Blob(['audio']), options), { code: 'local-unavailable' });
});
test('successful request contains only original audio and en, relative endpoint, signal and no fake confidence', async context => {
  const audio = new Blob(['original bytes'], { type: 'audio/webm;codecs=opus' });
  const signal = new AbortController().signal;
  context.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, '/api/v1/transcribe');
    assert.equal(init.signal, signal);
    assert.equal(init.method, 'POST');
    assert.equal(init.headers, undefined);
    assert.equal(init.redirect, 'error');
    assert.deepEqual([...init.body.keys()], ['audio', 'language']);
    assert.equal(init.body.get('language'), 'en');
    assert.equal(init.body.get('audio').type, audio.type);
    assert.equal(await init.body.get('audio').text(), await audio.text());
    return Response.json(result);
  });
  assert.deepEqual(await adapter.transcribe(audio, { ...options, signal }),
    { text: result.text, language: 'en', engine: 'whisper.cpp', model: 'base.en', processedLocally: true, ...result.timing });
});
test('typed errors use safe domain mapping without retries or raw runtime messages', async context => {
  for (const [code, status, expected] of [
    ['RUNTIME_BUSY', 429, 'recognition-failed'], ['INFERENCE_TIMEOUT', 504, 'recognition-failed'],
    ['NO_SPEECH', 422, 'no-speech'], ['AUDIO_UNSUPPORTED', 415, 'audio-track-unavailable'],
    ['RUNTIME_UNAVAILABLE', 503, 'local-unavailable'], ['RUNTIME_INCOMPATIBLE', 503, 'unsupported'],
  ]) {
    let calls = 0;
    context.mock.method(globalThis, 'fetch', async () => {
      calls++;
      return Response.json({ error: { code, message: '/private/native stderr' } }, { status });
    });
    await assert.rejects(transcribeWithSpeechRuntime(new Blob(['audio'])), error => {
      assert.equal(error.code, expected);
      assert.equal(error.message.includes('/private'), false);
      return true;
    });
    assert.equal(calls, 1);
    context.mock.restoreAll();
  }
});
test('malformed success/error JSON fails closed with a safe typed error', async context => {
  for (const [payload, status] of [[{}, 200], [{ ...result, processedLocally: false }, 200],
    [{ ...result, timing: { ...result.timing, totalMs: -1 } }, 200], [{ error: { code: 'unknown' } }, 500]]) {
    mock(context, payload, status);
    await assert.rejects(transcribeWithSpeechRuntime(new Blob(['audio'])), { code: 'recognition-failed' });
    context.mock.restoreAll();
  }
  context.mock.method(globalThis, 'fetch', async () => new Response('<private HTML>', { status: 500 }));
  await assert.rejects(getSpeechRuntimeHealth(), { code: 'recognition-failed' });
});
test('abort propagates through health and inference, including already-aborted calls', async context => {
  const controller = new AbortController();
  context.mock.method(globalThis, 'fetch', async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const pending = adapter.transcribe(new Blob(['audio']), { ...options, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { code: 'cancelled' });
  await assert.rejects(adapter.checkAvailability({ ...options, signal: controller.signal }), { code: 'cancelled' });
});
