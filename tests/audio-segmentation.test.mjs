import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateFrameRms, segmentSpeech } from '../src/domain/audio-analysis/index.ts';

function waveform(parts, sampleRate = 1000) {
  const samples = new Float32Array(Math.round(parts.reduce((total, [ms]) => total + ms, 0) * sampleRate / 1000));
  let offset = 0;
  for (const [ms, amplitude] of parts) {
    const count = Math.round(ms * sampleRate / 1000);
    for (let i = 0; i < count; i++) samples[offset + i] = i % 2 ? -amplitude : amplitude;
    offset += count;
  }
  return samples;
}

test('RMS uses the selected sample range and handles zero-length windows', () => {
  const samples = new Float32Array([1, -1, 0, 0]);
  assert.equal(calculateFrameRms(samples, 0, 2), 1);
  assert.equal(calculateFrameRms(samples, 0, 4), Math.sqrt(0.5));
  assert.equal(calculateFrameRms(samples, 2, 2), 0);
  for (const [start, end] of [[-1, 2], [0, 5], [2, 1], [0.5, 2]]) assert.throws(() => calculateFrameRms(samples, start, end), RangeError);
  assert.throws(() => calculateFrameRms(new Float32Array([NaN]), 0, 1), RangeError);
});

test('empty, silence and constant low noise are finite and have no speech', () => {
  for (const samples of [new Float32Array(), new Float32Array(1000), waveform([[1000, 0.001]])]) {
    const result = segmentSpeech(samples, 1000);
    assert.equal(result.speechSegments.length, 0);
    assert.ok(Number.isFinite(result.noiseFloorDb));
    assert.ok(Number.isFinite(result.thresholdDb));
    assert.ok(result.frames.every(f => Number.isFinite(f.rms) && Number.isFinite(f.db)));
    if (samples.length) assert.deepEqual(result.pauseSegments, [{ startMs: 0, endMs: 1000, durationMs: 1000 }]);
  }
});

for (const sampleRate of [8000, 16000, 44100, 48000]) {
  test(`speech/pause timing respects ${sampleRate} Hz and preserves edge silence`, () => {
    const result = segmentSpeech(waveform([[500, 0.001], [700, 0.1], [1500, 0.001], [700, 0.1], [500, 0.001]], sampleRate), sampleRate);
    assert.equal(result.durationMs, 3900);
    assert.equal(result.speechSegments.length, 2);
    assert.equal(result.pauseSegments.length, 3);
    assert.equal(result.pauseSegments[0].startMs, 0);
    assert.equal(result.pauseSegments.at(-1).endMs, 3900);
    assert.ok(result.pauseSegments[1].durationMs >= 1450);
    const ordered = [...result.speechSegments, ...result.pauseSegments].sort((a, b) => a.startMs - b.startMs);
    for (const [index, segment] of ordered.entries()) {
      assert.ok(segment.startMs >= 0 && segment.endMs <= result.durationMs && segment.durationMs > 0);
      assert.equal(segment.durationMs, segment.endMs - segment.startMs);
      if (index) assert.equal(ordered[index - 1].endMs, segment.startMs);
    }
    assert.equal(result.frames[1].startMs, 10);
    assert.equal(result.frames[0].endMs, 30);
  });
}

test('short gaps merge, short noise bursts disappear, and controls remain configurable', () => {
  const gap = waveform([[500, 0], [400, 0.1], [80, 0], [400, 0.1], [500, 0]]);
  assert.equal(segmentSpeech(gap, 1000).speechSegments.length, 1);
  assert.equal(segmentSpeech(gap, 1000, { mergeGapMs: 0 }).speechSegments.length, 2);
  const spike = waveform([[500, 0], [30, 0.1], [500, 0]]);
  assert.equal(segmentSpeech(spike, 1000).speechSegments.length, 0);
  assert.equal(segmentSpeech(spike, 1000, { minimumSpeechMs: 0 }).speechSegments.length, 1);
});

test('minimum pause filters interior reports while frames and short edge silence remain', () => {
  const result = segmentSpeech(waveform([[50, 0], [500, 0.1], [100, 0], [500, 0.1], [50, 0]]), 1000,
    { mergeGapMs: 0, minimumPauseMs: 200 });
  assert.equal(result.speechSegments.length, 2);
  assert.equal(result.pauseSegments.length, 2);
  assert.ok(result.frames.some(frame => frame.startMs > 550 && frame.startMs < 620 && !frame.isSpeech));
  assert.equal(result.pauseSegments[0].startMs, 0);
  assert.equal(result.pauseSegments.at(-1).endMs, result.durationMs);
});

test('partial final windows are clamped; quiet/loud activity is detected without mutation', () => {
  for (const amplitude of [0.003, 0.8]) {
    const samples = waveform([[400, 0.0001], [603, amplitude], [401, 0.0001]]);
    const snapshot = samples.slice();
    const config = { frameMs: 30, hopMs: 10 };
    const result = segmentSpeech(samples, 1000, config);
    assert.equal(result.speechSegments.length, 1);
    assert.equal(result.frames.at(-1).endMs, 1404);
    assert.deepEqual(result, segmentSpeech(samples, 1000, config));
    assert.deepEqual(samples, snapshot);
    assert.deepEqual(config, { frameMs: 30, hopMs: 10 });
  }
});

test('invalid sample rates/configuration/samples fail instead of producing invalid timing', () => {
  for (const rate of [0, -1, NaN, Infinity]) assert.throws(() => segmentSpeech(new Float32Array(10), rate), RangeError);
  for (const config of [{ frameMs: 0 }, { hopMs: 40 }, { noisePercentile: 2 }, { mergeGapMs: -1 }, { minimumPauseMs: NaN }]) {
    assert.throws(() => segmentSpeech(new Float32Array(10), 1000, config), RangeError);
  }
  assert.throws(() => segmentSpeech(new Float32Array([Infinity]), 1000), RangeError);
});
