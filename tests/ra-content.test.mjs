import assert from 'node:assert/strict';
import test from 'node:test';

import { compareReadAloud, calculateReadAloudMetrics } from '../src/domain/scoring/read-aloud/index.ts';
import { compareTokens } from '../src/domain/scoring/shared/compareTokens.ts';
import { readAloudQuestions } from '../src/data/question-bank/read-aloud.ts';

const expected = 'The research team published the report.';
function evaluate(actual, source = expected) {
  const comparison = compareReadAloud(source, actual);
  return { comparison, metrics: calculateReadAloudMetrics(comparison) };
}

test('exact content normalizes case, punctuation and whitespace while retaining raw text', () => {
  const actual = ' THE research team\n published the REPORT ';
  const { comparison, metrics } = evaluate(actual);
  assert.equal(comparison.expectedRaw, expected);
  assert.equal(comparison.actualRaw, actual);
  assert.equal(comparison.expectedNormalized, comparison.actualNormalized);
  assert.deepEqual(metrics, {
    correctWords: 6, expectedWords: 6, actualWords: 6,
    textCoverage: 1, textCoveragePercent: 100,
    omissionRate: 0, insertionRate: 0, substitutionRate: 0,
    exactTextMatch: true, totalErrors: 0,
  });
});

test('omission lowers unrounded coverage and preserves its expected position', () => {
  const { comparison, metrics } = evaluate('The team published the report.');
  assert.deepEqual(comparison.tokens.find(t => t.status === 'missing'), {
    status: 'missing', expected: 'research', expectedIndex: 1,
  });
  assert.equal(metrics.textCoverage, 5 / 6);
  assert.equal(metrics.textCoveragePercent, 83.33);
  assert.equal(metrics.omissionRate, 1 / 6);
  assert.equal(metrics.exactTextMatch, false);
});

test('insertion preserves full coverage but defeats exact match', () => {
  const { comparison, metrics } = evaluate('The research team actually published the report.');
  assert.deepEqual(comparison.tokens.find(t => t.status === 'extra'), {
    status: 'extra', actual: 'actually', actualIndex: 3,
  });
  assert.equal(metrics.textCoverage, 1);
  assert.equal(metrics.insertionRate, 1 / 6);
  assert.equal(metrics.actualWords, 7);
  assert.equal(metrics.exactTextMatch, false);
  assert.equal(metrics.totalErrors, 1);
});

test('substitution retains expected and detected words and both indices', () => {
  const { comparison, metrics } = evaluate('The research team released the report.');
  assert.deepEqual(comparison.tokens.find(t => t.status === 'substitution'), {
    status: 'substitution', expected: 'published', actual: 'released', expectedIndex: 3, actualIndex: 3,
  });
  assert.equal(metrics.substitutionRate, 1 / 6);
  assert.equal(metrics.textCoverage, 5 / 6);
});

test('reordered words use shared order-sensitive alignment without fuzzy correction', () => {
  const { comparison, metrics } = evaluate('The team research published the report.');
  assert.deepEqual(comparison.tokens, compareTokens(comparison.expectedTokens, comparison.actualTokens));
  assert.equal(metrics.exactTextMatch, false);
  assert.ok(metrics.textCoverage < 1);
  assert.equal(evaluate('student', 'students').metrics.textCoverage, 0);
});

test('repeated words align to distinct expected positions', () => {
  const { comparison, metrics } = evaluate('the cat and dog', 'the cat and the dog');
  assert.deepEqual(comparison.tokens.find(t => t.status === 'missing'), {
    status: 'missing', expected: 'the', expectedIndex: 3,
  });
  assert.equal(metrics.textCoverage, 4 / 5);
});

test('empty inputs produce finite rates with no exact text match', () => {
  for (const [source, actual] of [['', ''], ['', 'extra words'], [expected, ''], ['!!!', '???']]) {
    const { metrics } = evaluate(actual, source);
    assert.equal(metrics.textCoverage, 0);
    assert.equal(metrics.exactTextMatch, false);
    for (const value of Object.values(metrics)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
  }
  assert.equal(evaluate('', expected).metrics.omissionRate, 1);
});

test('mixed errors preserve counts, bounded coverage and input immutability', () => {
  const comparison = compareReadAloud(expected, 'A research team actually published report.');
  const snapshot = structuredClone(comparison);
  const first = calculateReadAloudMetrics(comparison);
  assert.deepEqual(first, calculateReadAloudMetrics(comparison));
  assert.deepEqual(comparison, snapshot);
  assert.equal(first.correctWords + comparison.missingCount + comparison.substitutionCount, first.expectedWords);
  assert.equal(first.correctWords + comparison.extraCount + comparison.substitutionCount, first.actualWords);
  assert.equal(first.totalErrors, comparison.missingCount + comparison.extraCount + comparison.substitutionCount);
  assert.ok(first.textCoverage >= 0 && first.textCoverage <= 1);
  assert.equal('pronunciationScore' in first, false);
  assert.equal('fluencyScore' in first, false);
  assert.equal('stressAccuracy' in first, false);
});

test('all six RA starter passages compare perfectly', () => {
  for (const question of readAloudQuestions) {
    const { metrics } = evaluate(question.transcript.toLowerCase().replace(/[.,]/g, ''), question.transcript);
    assert.equal(metrics.textCoverage, 1);
    assert.equal(metrics.exactTextMatch, true);
    assert.equal(metrics.totalErrors, 0);
  }
});
