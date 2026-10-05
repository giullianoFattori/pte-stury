import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateReadAloudFluency, buildReadAloudFluencyFeedback,
} from '../src/domain/scoring/read-aloud/index.ts';
import { segmentSpeech } from '../src/domain/audio-analysis/index.ts';

const segment = (startMs, endMs) => ({ startMs, endMs, durationMs: endMs - startMs });
function input(speech = [[700, 2700], [3200, 6800]], pauses = [[0, 700], [2700, 3200], [6800, 7500]], durationMs = 7500) {
  return { durationMs, frames: [], noiseFloorDb: -50, thresholdDb: -38,
    speechSegments: speech.map(([start, end]) => segment(start, end)),
    pauseSegments: pauses.map(([start, end]) => segment(start, end)) };
}

test('active-window timing excludes leading/trailing silence from pause metrics and WPM', () => {
  const metrics = calculateReadAloudFluency(input(), 20);
  assert.deepEqual(metrics, {
    recordingDurationMs: 7500, responseLatencyMs: 700, endingSilenceMs: 700,
    activeWindowMs: 6100, speechDurationMs: 5600, interiorPauseDurationMs: 500,
    speechRatio: 5600 / 6100, speechRatioPercent: 91.8,
    pauseCount: 1, longPauseCount: 1, averagePauseMs: 500, longestPauseMs: 500,
    detectedWordCount: 20, speechRateWpm: 20 / (6100 / 60_000), hasSpeech: true,
  });
});

test('extra setup/stop delays do not change active-window rate or pauses', () => {
  const baseline = calculateReadAloudFluency(input(), 20);
  const delayed = calculateReadAloudFluency(input([[2700, 4700], [5200, 8800]], [[0, 2700], [4700, 5200], [8800, 11500]], 11500), 20);
  assert.equal(delayed.responseLatencyMs, 2700);
  assert.equal(delayed.endingSilenceMs, 2700);
  for (const key of ['activeWindowMs', 'speechDurationMs', 'interiorPauseDurationMs', 'pauseCount', 'longPauseCount', 'speechRatio', 'speechRateWpm']) {
    assert.equal(delayed[key], baseline[key]);
  }
});

test('two long pauses lower continuity and practical rate without changing word count', () => {
  const continuous = calculateReadAloudFluency(input([[0, 6000]], [], 6000), 20);
  const paused = calculateReadAloudFluency(input([[0, 2000], [3000, 5000], [6000, 8000]], [[2000, 3000], [5000, 6000]], 8000), 20);
  assert.equal(paused.speechDurationMs, continuous.speechDurationMs);
  assert.equal(paused.longPauseCount, 2);
  assert.equal(paused.averagePauseMs, 1000);
  assert.equal(paused.longestPauseMs, 1000);
  assert.equal(paused.speechRateWpm, 150);
  assert.ok(paused.speechRateWpm < continuous.speechRateWpm);
  assert.ok(paused.speechRatio < continuous.speechRatio);
});

test('one region has no interior pauses; optional word count differs from explicit zero', () => {
  const source = input([[200, 1200]], [[0, 200], [1200, 1500]], 1500);
  const noTranscript = calculateReadAloudFluency(source);
  assert.equal(noTranscript.speechRatio, 1);
  for (const key of ['pauseCount', 'longPauseCount', 'averagePauseMs', 'longestPauseMs', 'interiorPauseDurationMs']) assert.equal(noTranscript[key], 0);
  assert.equal('speechRateWpm' in noTranscript, false);
  assert.equal('detectedWordCount' in noTranscript, false);
  assert.equal(calculateReadAloudFluency(source, 0).speechRateWpm, 0);
});

test('no speech has finite zero active metrics and no WPM even with detected text', () => {
  for (const wordCount of [undefined, 10]) {
    const metrics = calculateReadAloudFluency(input([], [[0, 7500]]), wordCount);
    assert.equal(metrics.hasSpeech, false);
    assert.equal(metrics.activeWindowMs, 0);
    assert.equal(metrics.speechRatio, 0);
    assert.equal(metrics.pauseCount, 0);
    assert.equal(metrics.longPauseCount, 0);
    assert.equal(metrics.speechRateWpm, undefined);
    for (const value of Object.values(metrics)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
    assert.deepEqual(buildReadAloudFluencyFeedback(metrics), ['No continuous speech was detected.']);
  }
});

test('long-pause threshold is inclusive and configurable', () => {
  assert.equal(calculateReadAloudFluency(input(), undefined, { longPauseMs: 500 }).longPauseCount, 1);
  assert.equal(calculateReadAloudFluency(input(), undefined, { longPauseMs: 501 }).longPauseCount, 0);
});

test('input order/mutation, boundary epsilon and overlap ratio clamp are safe', () => {
  const source = input([[3200, 6800], [700, 2700]]);
  source.pauseSegments[1].endMs += 1e-7;
  const snapshot = structuredClone(source);
  const metrics = calculateReadAloudFluency(source, 20);
  assert.equal(metrics.pauseCount, 1);
  assert.deepEqual(source, snapshot);
  assert.deepEqual(metrics, calculateReadAloudFluency(source, 20));
  const overlapping = calculateReadAloudFluency(input([[0, 1000], [500, 1500]], [], 1500));
  assert.equal(overlapping.speechRatio, 1);
});

test('invalid numeric inputs are rejected rather than producing NaN/Infinity', () => {
  for (const count of [-1, 0.5, NaN, Infinity]) assert.throws(() => calculateReadAloudFluency(input(), count), RangeError);
  for (const longPauseMs of [-1, NaN, Infinity]) assert.throws(() => calculateReadAloudFluency(input(), undefined, { longPauseMs }), RangeError);
  for (const durationMs of [-1, NaN, Infinity]) assert.throws(() => calculateReadAloudFluency({ ...input(), durationMs }), RangeError);
  assert.throws(() => calculateReadAloudFluency(input([[0, 8000]])), RangeError);
});

test('feedback thresholds are configurable and do not reward speed', () => {
  const continuous = calculateReadAloudFluency(input([[0, 6000]], [], 6000), 20);
  const fast = { ...continuous, speechRateWpm: 1000 };
  assert.deepEqual(buildReadAloudFluencyFeedback(continuous), buildReadAloudFluencyFeedback(fast));
  const paused = calculateReadAloudFluency(input([[0, 1000], [2000, 3000], [4000, 5000]], [[1000, 2000], [3000, 4000]], 5000));
  assert.equal(buildReadAloudFluencyFeedback(paused).length, 2);
  assert.deepEqual(buildReadAloudFluencyFeedback(paused, { severalLongPauses: 3, lowSpeechRatio: 0.5 }), [
    '2 longer pauses were detected inside the reading.',
  ]);
  assert.throws(() => buildReadAloudFluencyFeedback(paused, { lowSpeechRatio: NaN }), RangeError);
});

test('real segmentation leaves unreported small gaps in the ratio without fabricating pauses', () => {
  const samples = new Float32Array(2000);
  samples.fill(0.1, 300, 900); samples.fill(0.1, 1040, 1640);
  const segmentation = segmentSpeech(samples, 1000, { mergeGapMs: 0, minimumPauseMs: 200 });
  const metrics = calculateReadAloudFluency(segmentation);
  assert.equal(metrics.pauseCount, 0);
  assert.ok(metrics.speechRatio < 1);
  assert.ok(metrics.speechDurationMs < metrics.activeWindowMs);
});
