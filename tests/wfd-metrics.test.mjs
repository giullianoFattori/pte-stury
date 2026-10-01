import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateWfdMetrics } from '../src/domain/scoring/wfd/calculateWfdMetrics.ts';
import { compareWfdAnswer } from '../src/domain/scoring/wfd/compareWfdAnswer.ts';

const expected = 'Students should submit their assignments before Friday.';
const metricsFor = actual => calculateWfdMetrics(compareWfdAnswer(expected, actual));

test('perfect answer returns the full scoring contract', () => {
  assert.deepEqual(metricsFor(expected), {
    correctWords: 7, expectedWords: 7, actualWords: 7,
    wordAccuracy: 1, wordAccuracyPercent: 100,
    missingRate: 0, extraRate: 0, substitutionRate: 0,
    totalErrors: 0, exactMatch: true,
  });
});

test('normalization differences still qualify for exact word match', () => {
  assert.equal(metricsFor('  STUDENTS should submit their assignments before friday  ').exactMatch, true);
});

test('missing word lowers recall and uses expected size for its rate', () => {
  const score = metricsFor('Students should submit assignments before Friday.');
  assert.equal(score.correctWords, 6);
  assert.equal(score.actualWords, 6);
  assert.equal(score.wordAccuracy, 6 / 7);
  assert.equal(score.wordAccuracyPercent, 85.71);
  assert.equal(score.missingRate, 1 / 7);
  assert.equal(score.substitutionRate, 0);
  assert.equal(score.extraRate, 0);
  assert.equal(score.totalErrors, 1);
  assert.equal(score.exactMatch, false);
});

test('substitution lowers recall and has its own diagnostic rate', () => {
  const score = metricsFor('Students must submit their assignments before Friday.');
  assert.equal(score.wordAccuracy, 6 / 7);
  assert.equal(score.wordAccuracyPercent, 85.71);
  assert.equal(score.substitutionRate, 1 / 7);
  assert.equal(score.totalErrors, 1);
  assert.equal(score.exactMatch, false);
});

test('extra word preserves full recall but prevents exact match', () => {
  const score = metricsFor('Students should quickly submit their assignments before Friday.');
  assert.equal(score.actualWords, 8);
  assert.equal(score.wordAccuracy, 1);
  assert.equal(score.wordAccuracyPercent, 100);
  assert.equal(score.extraRate, 1 / 7);
  assert.equal(score.totalErrors, 1);
  assert.equal(score.exactMatch, false);
});

test('activity example returns 71.43% without rounding the underlying ratios', () => {
  const score = metricsFor('Student should submit assignments before Friday.');
  assert.deepEqual(score, {
    correctWords: 5, expectedWords: 7, actualWords: 6,
    wordAccuracy: 5 / 7, wordAccuracyPercent: 71.43,
    missingRate: 1 / 7, extraRate: 0, substitutionRate: 1 / 7,
    totalErrors: 2, exactMatch: false,
  });
});

test('all three error categories contribute to total errors', () => {
  const score = metricsFor('Student should quickly submit assignments before Friday.');
  assert.equal(score.missingRate, 1 / 7);
  assert.equal(score.extraRate, 1 / 7);
  assert.equal(score.substitutionRate, 1 / 7);
  assert.equal(score.totalErrors, 3);
});

test('completely wrong or empty actual text yields zero accuracy', () => {
  for (const actual of ['cats dance silently', '']) {
    const score = metricsFor(actual);
    assert.equal(score.wordAccuracy, 0);
    assert.equal(score.wordAccuracyPercent, 0);
    assert.equal(score.totalErrors, 7);
    assert.equal(score.exactMatch, false);
  }
});

test('empty expected text yields finite zero rates even with extra words', () => {
  for (const actual of ['', 'hello']) {
    const score = calculateWfdMetrics(compareWfdAnswer('', actual));
    assert.equal(score.wordAccuracy, 0);
    assert.equal(score.wordAccuracyPercent, 0);
    assert.equal(score.missingRate, 0);
    assert.equal(score.extraRate, 0);
    assert.equal(score.substitutionRate, 0);
    assert.equal(score.exactMatch, false);
    assert.equal(score.totalErrors, actual ? 1 : 0);
    for (const value of Object.values(score).filter(value => typeof value === 'number')) {
      assert.ok(Number.isFinite(value));
    }
  }
});

test('extra rate can exceed one without reducing word accuracy below zero', () => {
  const score = calculateWfdMetrics(compareWfdAnswer('study', 'study today very carefully'));
  assert.equal(score.extraRate, 3);
  assert.equal(score.wordAccuracy, 1);
  assert.equal(score.totalErrors, 3);
  assert.equal(score.exactMatch, false);
});

test('calculating metrics is deterministic and does not mutate comparison', () => {
  const comparison = compareWfdAnswer(expected, 'Student should submit assignments before Friday.');
  const snapshot = structuredClone(comparison);
  assert.deepEqual(calculateWfdMetrics(comparison), calculateWfdMetrics(comparison));
  assert.deepEqual(comparison, snapshot);
});
