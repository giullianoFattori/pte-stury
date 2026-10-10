import assert from 'node:assert/strict';
import test from 'node:test';

import { compareWfdAnswer } from '../src/domain/scoring/wfd/compareWfdAnswer.ts';
import { calculateWfdMetrics } from '../src/domain/scoring/wfd/calculateWfdMetrics.ts';
import { buildWfdAttempt } from '../src/features/write-from-dictation/services/buildWfdAttempt.ts';

const question = {
  id: 'wfd-001', taskType: 'write-from-dictation', difficulty: 1,
  prompt: 'Listen to the sentence and type exactly what you hear.',
  answer: 'Students should submit their assignments before Friday.',
  createdAt: '2026-10-01T00:00:00.000Z',
};

function inputFor(answer) {
  const comparison = compareWfdAnswer(question.answer, answer);
  return { question, answer, comparison, score: calculateWfdMetrics(comparison), durationMs: 5183 };
}

test('attempt stores raw text, normalized score and the complete metric snapshot', () => {
  const input = inputFor(' Student should submit assignments before Friday.  ');
  const original = structuredClone(input);
  const attempt = buildWfdAttempt(input);
  assert.equal(attempt.itemId, 'wfd-001');
  assert.equal(attempt.taskType, 'write-from-dictation');
  assert.equal(attempt.responseText, input.answer);
  assert.equal(attempt.durationMs, 5183);
  assert.equal(attempt.score, 5 / 7);
  assert.deepEqual(attempt.metrics, {
    wordAccuracy: 5 / 7, wordAccuracyPercent: 71.43,
    correctWords: 5, expectedWords: 7, actualWords: 6,
    missingCount: 1, extraCount: 0, substitutionCount: 1,
    missingRate: 1 / 7, extraRate: 0, substitutionRate: 1 / 7,
    totalErrors: 2, exactMatch: false,
  });
  assert.deepEqual(input, original);
});

test('each attempt has a distinct UUID and a current ISO timestamp', () => {
  const input = inputFor(question.answer);
  const startedAt = Date.now();
  const first = buildWfdAttempt(input);
  const second = buildWfdAttempt(input);
  assert.match(first.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(first.id, second.id);
  assert.equal(first.itemId, second.itemId);
  assert.equal(new Date(first.createdAt).toISOString(), first.createdAt);
  assert.ok(Date.parse(first.createdAt) >= startedAt && Date.parse(first.createdAt) <= Date.now());
  assert.equal(first.score, 1);
  assert.equal(first.metrics.exactMatch, true);
});

test('saved metrics are detached from mutable comparison and score objects', () => {
  const input = inputFor(question.answer);
  const attempt = buildWfdAttempt(input);
  input.comparison.correctCount = 0;
  input.score.wordAccuracy = 0;
  input.score.exactMatch = false;
  assert.equal(attempt.score, 1);
  assert.equal(attempt.metrics.wordAccuracy, 1);
  assert.equal(attempt.metrics.correctWords, 7);
  assert.equal(attempt.metrics.exactMatch, true);
});

test('captures the presented revision without changing legacy attempts or following later question changes', () => {
  const legacy = inputFor(question.answer);
  assert.equal(Object.hasOwn(buildWfdAttempt(legacy), 'itemRevision'), false);
  const presented = { ...legacy, question: { ...legacy.question, revision: 7 } };
  const saved = buildWfdAttempt(presented);
  presented.question.revision = 8;
  assert.equal(saved.itemRevision, 7);
  assert.equal(buildWfdAttempt(presented).itemRevision, 8);
});
