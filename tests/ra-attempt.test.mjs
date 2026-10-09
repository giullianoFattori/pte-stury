import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReadAloudAttempt } from '../src/features/read-aloud/services/buildReadAloudAttempt.ts';
import { compareReadAloud, calculateReadAloudMetrics, calculateReadAloudFluency } from '../src/domain/scoring/read-aloud/index.ts';

const question = { id: 'ra-003', taskType: 'read-aloud', difficulty: 2, prompt: 'Read aloud.',
  transcript: 'The research team published the report.', createdAt: '2026-10-04T00:00:00.000Z' };
const segment = (startMs, endMs) => ({ startMs, endMs, durationMs: endMs - startMs });
function input(text = question.transcript) {
  const comparison = compareReadAloud(question.transcript, text);
  const segmentation = { durationMs: 10000, frames: [], noiseFloorDb: -50, thresholdDb: -38,
    speechSegments: [segment(2000, 4000), segment(5000, 8000)],
    pauseSegments: [segment(0, 2000), segment(4000, 5000), segment(8000, 10000)] };
  return { question, comparison, contentMetrics: calculateReadAloudMetrics(comparison),
    fluencyMetrics: calculateReadAloudFluency(segmentation, comparison.actualWordCount),
    longPauseThresholdMs: 500, durationMs: 10023,
    transcription: { text, confidence: 0.87, processedLocally: true, language: 'en-AU', engine: 'browser-on-device' } };
}

test('RA stores a detached finite aggregate snapshot, with independent content and timing', () => {
  const values = input(' the RESEARCH team published the report ');
  const before = structuredClone(values);
  const first = buildReadAloudAttempt(values);
  const second = buildReadAloudAttempt(values);
  assert.notEqual(first.id, second.id);
  assert.match(first.id, /^[0-9a-f-]{36}$/);
  assert.equal(new Date(first.createdAt).toISOString(), first.createdAt);
  assert.equal(first.responseText, values.transcription.text);
  assert.equal(first.itemId, 'ra-003');
  assert.equal(first.taskType, 'read-aloud');
  assert.equal(first.durationMs, 10023);
  assert.equal(first.score, 1);
  assert.deepEqual(first.metrics, {
    textCoverage: 1, textCoveragePercent: 100, correctWords: 6, expectedWords: 6, actualWords: 6,
    missingCount: 0, extraCount: 0, substitutionCount: 0, omissionRate: 0, insertionRate: 0,
    substitutionRate: 0, totalErrors: 0, exactTextMatch: true,
    audioDecodedDurationMs: 10000, responseLatencyMs: 2000, endingSilenceMs: 2000,
    activeWindowMs: 6000, speechDurationMs: 5000, interiorPauseDurationMs: 1000,
    speechRatio: 5 / 6, speechRatioPercent: 83.33, pauseCount: 1, longPauseCount: 1,
    longPauseThresholdMs: 500, averagePauseMs: 1000, longestPauseMs: 1000,
    hasSpeech: true, detectedWordCount: 6, speechRateWpm: 60,
    sttConfidence: 0.87, processedLocally: true,
  });
  assert.deepEqual(Object.keys(first).sort(), ['id', 'itemId', 'taskType', 'createdAt', 'responseText', 'durationMs', 'score', 'metrics'].sort());
  assert.deepEqual(values, before);
  values.contentMetrics.textCoverage = 0;
  values.fluencyMetrics.longPauseCount = 10;
  assert.equal(first.score, 1);
  assert.equal(first.metrics.longPauseCount, 1);
});

test('RA stores observable mismatch counts and unrounded coverage without a combined score', () => {
  const attempt = buildReadAloudAttempt(input('The team published a report.'));
  assert.equal(attempt.metrics.missingCount, 1);
  assert.equal(attempt.metrics.substitutionCount, 1);
  assert.equal(attempt.metrics.totalErrors, 2);
  assert.equal(attempt.score, 4 / 6);
  assert.equal(attempt.score, attempt.metrics.textCoverage);
  assert.equal(attempt.metrics.omissionRate, 1 / 6);
  assert.equal(attempt.metrics.substitutionRate, 1 / 6);
  assert.equal(attempt.metrics.exactTextMatch, false);
  assert.equal(buildReadAloudAttempt(input('The research team actually published the report.')).metrics.extraCount, 1);
});

test('unavailable rate/count are omitted and actual threshold is retained', () => {
  const values = input();
  delete values.fluencyMetrics.detectedWordCount;
  delete values.fluencyMetrics.speechRateWpm;
  delete values.transcription.confidence;
  values.longPauseThresholdMs = 750;
  const attempt = buildReadAloudAttempt(values);
  assert.equal('detectedWordCount' in attempt.metrics, false);
  assert.equal('speechRateWpm' in attempt.metrics, false);
  assert.equal(attempt.metrics.longPauseThresholdMs, 750);
  assert.equal('sttConfidence' in attempt.metrics, false);
});

test('nonlocal, non-RA, empty transcription, invalid duration and score are rejected', () => {
  for (const change of [
    value => { value.question = { ...question, taskType: 'repeat-sentence' }; },
    value => { value.transcription.processedLocally = false; },
    value => { value.transcription.text = '...'; },
    ...[-1, NaN, Infinity].map(n => value => { value.durationMs = n; }),
    ...[-0.1, 1.1, NaN, Infinity].map(n => value => { value.contentMetrics.textCoverage = n; }),
  ]) {
    const values = input(); change(values);
    assert.throws(() => buildReadAloudAttempt(values));
  }
});

test('every persisted numeric field rejects nonfinite values including optional STT metadata', () => {
  for (const group of ['contentMetrics', 'fluencyMetrics']) {
    for (const [key, value] of Object.entries(input()[group])) {
      if (typeof value !== 'number') continue;
      for (const invalid of [NaN, Infinity, -Infinity]) {
        const values = input(); values[group][key] = invalid;
        assert.throws(() => buildReadAloudAttempt(values), key);
      }
    }
  }
  for (const key of ['missingCount', 'extraCount', 'substitutionCount']) {
    const values = input(); values.comparison[key] = NaN;
    assert.throws(() => buildReadAloudAttempt(values));
  }
  for (const key of ['confidence']) {
    const values = input(); values.transcription[key] = Infinity;
    assert.throws(() => buildReadAloudAttempt(values));
  }
  const values = input(); values.longPauseThresholdMs = Infinity;
  assert.throws(() => buildReadAloudAttempt(values));
});

test('Whisper local result persists without invented confidence or schema metadata', () => {
  const values = input();
  values.transcription = { text: values.transcription.text, engine: 'whisper.cpp', model: 'base.en',
    language: 'en', processedLocally: true, audioMs: 2000, inferenceMs: 1000, totalMs: 1300 };
  const attempt = buildReadAloudAttempt(values);
  assert.equal(attempt.metrics.processedLocally, true);
  assert.equal('sttConfidence' in attempt.metrics, false);
  assert.equal(Object.values(attempt.metrics).some(value => typeof value === 'string'), false);
});
