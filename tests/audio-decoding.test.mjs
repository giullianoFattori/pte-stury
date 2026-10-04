import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeAudioBlob } from '../src/infrastructure/audio/decodeAudioBlob.ts';

function environment(t, { channels = [[0.4, -0.4], [0.2, -0.2]], sampleRate = 8000, failure, legacy = false, closeFailure = false } = {}) {
  const calls = { closes: 0, bytes: null };
  class Context {
    state = 'running';
    async decodeAudioData(bytes) {
      calls.bytes = bytes;
      if (failure) throw Error('Raw browser failure');
      return { numberOfChannels: channels.length, length: channels[0]?.length ?? 0,
        sampleRate, duration: (channels[0]?.length ?? 0) / sampleRate,
        getChannelData: index => new Float32Array(channels[index]) };
    }
    async close() { calls.closes++; if (closeFailure) throw Error('Raw close failure'); this.state = 'closed'; }
  }
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: legacy ? { webkitAudioContext: Context } : { AudioContext: Context } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'window', descriptor); else delete globalThis.window; });
  return calls;
}

test('multichannel PCM averages all channels and closes context; legacy constructor works', async t => {
  const calls = environment(t, { legacy: true });
  const bytes = new Uint8Array([1, 2]);
  const result = await decodeAudioBlob(new Blob([bytes]));
  assert.equal(result.sampleRate, 8000);
  assert.equal(result.durationMs, 0.25);
  assert.ok(Math.abs(result.samples[0] - 0.3) < 1e-6);
  assert.ok(Math.abs(result.samples[1] + 0.3) < 1e-6);
  assert.deepEqual(new Uint8Array(calls.bytes), bytes);
  assert.equal(calls.closes, 1);
});

test('empty Blob and unsupported Web Audio produce controlled errors', async t => {
  const calls = environment(t);
  await assert.rejects(decodeAudioBlob(new Blob()), e => e.code === 'empty-audio');
  assert.equal(calls.closes, 0);
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  await assert.rejects(decodeAudioBlob(new Blob(['audio'])), e => e.code === 'unsupported');
});

test('Blob read failure also closes the newly created context', async t => {
  const calls = environment(t);
  const blob = new Blob(['audio']);
  t.mock.method(blob, 'arrayBuffer', async () => { throw Error('Raw read failure'); });
  await assert.rejects(decodeAudioBlob(blob), e => e.code === 'decode-failed' && !e.message.includes('Raw'));
  assert.equal(calls.closes, 1);
});

for (const options of [{ failure: true }, { channels: [] }, { channels: [[]] }, { sampleRate: 0 }, { sampleRate: Infinity }, { channels: [[NaN]] }, { closeFailure: true }]) {
  test(`decode/validation failure ${JSON.stringify(options)} closes resources with safe errors`, async t => {
    const calls = environment(t, options);
    await assert.rejects(decodeAudioBlob(new Blob(['audio'])), e =>
      ['empty-audio', 'decode-failed'].includes(e.code) && !e.message.includes('Raw'));
    assert.equal(calls.closes, 1);
  });
}
