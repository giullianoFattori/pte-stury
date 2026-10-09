import assert from 'node:assert/strict';
import test from 'node:test';

import { compareRepeatSentence, calculateRepeatSentenceMetrics, analyseRepeatSentenceChunks } from '../src/domain/scoring/repeat-sentence/index.ts';
import { buildRepeatSentenceAttempt } from '../src/features/repeat-sentence/services/buildRepeatSentenceAttempt.ts';

const question = {
  id: 'rs-001', taskType: 'repeat-sentence', difficulty: 1,
  prompt: 'Listen and repeat.', transcript: 'Students must arrive before nine tomorrow.',
  chunks: ['Students must arrive', 'before nine tomorrow'], createdAt: '2026-10-02T00:00:00.000Z',
};

function input(text = question.transcript) {
  const comparison = compareRepeatSentence(question.transcript, text);
  return {
    question, comparison, score: calculateRepeatSentenceMetrics(comparison),
    chunkAnalysis: analyseRepeatSentenceChunks(comparison, question.chunks), durationMs: 5123,
    transcription: { text, confidence: 0.87, processedLocally: true, language: 'en-AU', engine: 'browser-on-device' },
  };
}

test('RS builder stores detected text, duration and exact metric snapshot without audio', () => {
  const values = input(' students MUST arrive before nine tomorrow ');
  const attempt = buildRepeatSentenceAttempt(values);
  assert.equal(attempt.itemId, question.id);
  assert.equal(attempt.taskType, 'repeat-sentence');
  assert.equal(attempt.responseText, values.transcription.text);
  assert.equal(attempt.durationMs, 5123);
  assert.equal(attempt.score, 1);
  assert.equal(new Date(attempt.createdAt).toISOString(), attempt.createdAt);
  assert.match(attempt.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(attempt.metrics, {
    contentRecall: 1, contentRecallPercent: 100,
    sequenceAccuracy: 1, sequenceAccuracyPercent: 100,
    correctWords: 6, expectedWords: 6, actualWords: 6,
    missingCount: 0, extraCount: 0, substitutionCount: 0,
    missingRate: 0, extraRate: 0, substitutionRate: 0,
    totalErrors: 0, exactContentMatch: true,
    chunkRetention: 1, chunkRetentionPercent: 100, retainedChunks: 2, totalChunks: 2,
    sttConfidence: 0.87, processedLocally: true,
  });
  assert.deepEqual(Object.keys(attempt).sort(), ['id', 'itemId', 'taskType', 'createdAt', 'responseText', 'durationMs', 'score', 'metrics'].sort());
  for (const value of Object.values(attempt.metrics)) assert.ok(typeof value === 'number' || typeof value === 'boolean');
  assert.equal(JSON.stringify(attempt).includes('blob:'), false);
  assert.equal('pronunciationScore' in attempt.metrics, false);
  assert.equal('fluencyScore' in attempt.metrics, false);
});

test('omission persists normalized unrounded recall and affected chunk retention', () => {
  const attempt = buildRepeatSentenceAttempt(input('Students must arrive nine tomorrow.'));
  assert.equal(attempt.score, 5 / 6);
  assert.equal(attempt.score, attempt.metrics.contentRecall);
  assert.equal(attempt.metrics.contentRecallPercent, 83.33);
  assert.equal(attempt.metrics.missingCount, 1);
  assert.equal(attempt.metrics.missingRate, 1 / 6);
  assert.equal(attempt.metrics.exactContentMatch, false);
  assert.equal(attempt.metrics.chunkRetention, 0.5);
});

test('extra words preserve full recall but exact content match stays false', () => {
  const attempt = buildRepeatSentenceAttempt(input('Students really must arrive before nine tomorrow.'));
  assert.equal(attempt.score, 1);
  assert.equal(attempt.metrics.extraCount, 1);
  assert.equal(attempt.metrics.extraRate, 1 / 6);
  assert.equal(attempt.metrics.exactContentMatch, false);
});

test('unavailable confidence is omitted while chunk fallback metrics remain', () => {
  const values = input();
  values.chunkAnalysis = null;
  delete values.transcription.confidence;
  const attempt = buildRepeatSentenceAttempt(values);
  for (const key of ['chunkRetention', 'chunkRetentionPercent', 'retainedChunks', 'totalChunks']) assert.equal(attempt.metrics[key], 0);
  assert.equal('sttConfidence' in attempt.metrics, false);
  assert.equal(attempt.score, 1);
});

test('builders generate unique identities and detached immutable metric snapshots', () => {
  const values = input();
  const before = structuredClone(values);
  const first = buildRepeatSentenceAttempt(values);
  const second = buildRepeatSentenceAttempt(values);
  assert.notEqual(first.id, second.id);
  assert.equal(first.itemId, second.itemId);
  assert.deepEqual(values, before);
  values.score.contentRecall = 0;
  values.comparison.missingCount = 100;
  values.chunkAnalysis.retainedChunks = 0;
  assert.equal(first.score, 1);
  assert.equal(first.metrics.missingCount, 0);
  assert.equal(first.metrics.retainedChunks, 2);
});

test('remote results and non-RS questions are rejected under the local-only rule', () => {
  const values = input();
  values.transcription.processedLocally = false;
  assert.throws(() => buildRepeatSentenceAttempt(values), /Only locally transcribed/);
  values.transcription.processedLocally = true;
  values.question = { ...question, taskType: 'write-from-dictation' };
  assert.throws(() => buildRepeatSentenceAttempt(values), /Only locally transcribed/);
});

test('Whisper local result persists without invented confidence or schema metadata', () => {
  const values = input();
  values.transcription = { text: values.transcription.text, engine: 'whisper.cpp', model: 'base.en',
    language: 'en', processedLocally: true, audioMs: 2000, inferenceMs: 1000, totalMs: 1300 };
  const attempt = buildRepeatSentenceAttempt(values);
  assert.equal(attempt.metrics.processedLocally, true);
  assert.equal('sttConfidence' in attempt.metrics, false);
  assert.equal(Object.values(attempt.metrics).some(value => typeof value === 'string'), false);
});
