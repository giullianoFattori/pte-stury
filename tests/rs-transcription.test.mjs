import assert from 'node:assert/strict';
import test from 'node:test';

import { BrowserOnDeviceSpeechToTextAdapter } from '../src/infrastructure/speech/BrowserOnDeviceSpeechToTextAdapter.ts';
import { SpeechToTextError } from '../src/domain/speech/types.ts';

function environment(t, { availability = 'available', error, text = '  Students must arrive.  ', hang = false, capture = true } = {}) {
  const calls = { created: [], revoked: [], starts: [], packs: [], installs: 0, stops: 0, aborts: 0, plays: 0 };
  const track = { kind: 'audio', readyState: 'live', stop() { calls.stops++; this.readyState = 'ended'; } };
  class Recognition {
    processLocally = false;
    static async available(options) { calls.packs.push(options); return availability; }
    static async install(options) { calls.packs.push(options); calls.installs++; return true; }
    start(input) {
      calls.starts.push({ input, local: this.processLocally, lang: this.lang });
      assert.equal(this.interimResults, false);
      assert.equal(this.continuous, false);
      assert.equal(this.maxAlternatives, 1);
      this.onstart?.();
      if (hang) return;
      queueMicrotask(() => {
        if (error) this.onerror?.({ error });
        else { this.onresult?.({ results: [{ isFinal: true, 0: { transcript: text, confidence: 0.8 } }] }); this.onend?.(); }
      });
    }
    abort() { calls.aborts++; }
    stop() { this.onend?.(); }
  }
  const audios = [];
  const document = { createElement() {
    const audio = {
      src: '',
      captureStream: capture ? () => ({ getAudioTracks: () => [track], getTracks: () => [track] }) : undefined,
      load() { if (this.src) queueMicrotask(() => this.oncanplay?.()); },
      async play() { calls.plays++; },
      pause() { this.paused = true; },
      removeAttribute() { this.src = ''; },
    };
    audios.push(audio);
    return audio;
  } };
  for (const [name, value] of Object.entries({ window: { SpeechRecognition: Recognition }, document })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; });
  }
  t.mock.method(URL, 'createObjectURL', blob => { calls.created.push(blob); return 'blob:test'; });
  t.mock.method(URL, 'revokeObjectURL', url => calls.revoked.push(url));
  return { calls, track, audios, Recognition, adapter: new BrowserOnDeviceSpeechToTextAdapter() };
}

test('strict capability detection rejects missing recognition, local mode, install or captureStream', async t => {
  const env = environment(t);
  for (const Constructor of [undefined, class {}, class { processLocally = false; static available() {} }]) {
    window.SpeechRecognition = Constructor;
    assert.equal(await env.adapter.checkAvailability({ language: 'en-AU' }), 'unsupported');
  }
  window.SpeechRecognition = env.Recognition;
  document.createElement = () => ({});
  assert.equal(await env.adapter.checkAvailability({ language: 'en-AU' }), 'unsupported');
  assert.equal(env.calls.starts.length + env.calls.installs, 0);
});

for (const availability of ['available', 'downloadable', 'downloading', 'unavailable']) {
  test(`availability ${availability} stays local and never auto-installs`, async t => {
    const { adapter, calls } = environment(t, { availability });
    assert.equal(await adapter.checkAvailability({ language: 'en-AU' }), availability);
    assert.deepEqual(calls.packs[0], { langs: ['en-AU'], processLocally: true, quality: 'dictation' });
    assert.equal(calls.installs + calls.starts.length, 0);
  });
}

test('explicit install requests only the local dictation language pack', async t => {
  const { adapter, calls } = environment(t, { availability: 'downloadable' });
  assert.equal(await adapter.installLanguage({ language: 'en-AU' }), true);
  assert.equal(calls.installs, 1);
  assert.equal(calls.packs[0].processLocally, true);
});

test('transcribes the exact Blob track, returns metadata and releases all resources', async t => {
  const { adapter, calls, track, audios } = environment(t);
  const blob = new Blob(['recorded bytes'], { type: 'audio/ogg' });
  const result = await adapter.transcribe(blob, { language: 'en-AU' });
  assert.deepEqual(result, { text: 'Students must arrive.', confidence: 0.8, engine: 'browser-on-device', language: 'en-AU', processedLocally: true });
  assert.equal(calls.created[0], blob);
  assert.equal(calls.starts[0].input, track);
  assert.equal(calls.starts[0].local, true);
  assert.deepEqual(calls.revoked, ['blob:test']);
  assert.equal(calls.stops, 1);
  assert.equal(calls.aborts, 1);
  assert.equal(audios.at(-1).paused, true);
});

for (const [error, code] of [['no-speech', 'no-speech'], ['language-not-supported', 'language-unavailable'], ['audio-capture', 'audio-track-unavailable'], ['not-allowed', 'local-unavailable'], ['network', 'recognition-failed']]) {
  test(`browser ${error} is translated without remote retry`, async t => {
    const { adapter, calls } = environment(t, { error });
    await assert.rejects(adapter.transcribe(new Blob(['audio']), { language: 'en-AU' }), e => e instanceof SpeechToTextError && e.code === code);
    assert.equal(calls.starts.length, 1);
    assert.equal(calls.starts[0].local, true);
    assert.deepEqual(calls.revoked, ['blob:test']);
    assert.equal(calls.stops, 1);
  });
}

test('empty transcript is no-speech, not a score', async t => {
  const { adapter } = environment(t, { text: '   ' });
  await assert.rejects(adapter.transcribe(new Blob(['audio']), { language: 'en-AU' }), e => e.code === 'no-speech');
});

test('unavailable language and empty Blob never start recognition', async t => {
  const { adapter, calls } = environment(t, { availability: 'unavailable' });
  await assert.rejects(adapter.transcribe(new Blob(['audio']), { language: 'en-AU' }), e => e.code === 'language-unavailable');
  window.SpeechRecognition.available = async () => 'available';
  await assert.rejects(adapter.transcribe(new Blob([]), { language: 'en-AU' }), e => e.code === 'no-speech');
  assert.equal(calls.starts.length + calls.created.length, 0);
});

test('cancellation aborts recognition and revokes the temporary URL', async t => {
  const { adapter, calls } = environment(t, { hang: true });
  const controller = new AbortController();
  const promise = adapter.transcribe(new Blob(['audio']), { language: 'en-AU', signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await assert.rejects(promise, e => e.code === 'cancelled');
  assert.equal(calls.aborts, 1);
  assert.equal(calls.stops, 1);
  assert.deepEqual(calls.revoked, ['blob:test']);
});
