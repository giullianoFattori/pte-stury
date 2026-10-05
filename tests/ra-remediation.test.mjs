import assert from 'node:assert/strict';
import test from 'node:test';

import { compareReadAloud, calculateReadAloudMetrics, calculateReadAloudFluency } from '../src/domain/scoring/read-aloud/index.ts';
import { buildReadAloudAttempt } from '../src/features/read-aloud/services/buildReadAloudAttempt.ts';
import { buildReadAloudErrorRecords } from '../src/features/read-aloud/services/buildReadAloudErrorRecords.ts';
import { buildReadAloudReviewItems } from '../src/features/read-aloud/services/buildReadAloudReviewItems.ts';

const question = {
  id: 'ra-001', taskType: 'read-aloud', difficulty: 1,
  prompt: 'Read the text aloud clearly and naturally.', transcript: 'Students must arrive before nine tomorrow.',
  createdAt: '2026-10-02T00:00:00.000Z',
};

function outcome(text, item = question) {
  const comparison = compareReadAloud(item.transcript ?? item.answer, text);
  const attempt = buildReadAloudAttempt({
    question: item, comparison, contentMetrics: calculateReadAloudMetrics(comparison),
    fluencyMetrics: calculateReadAloudFluency({
      durationMs: 10000, frames: [], noiseFloorDb: -50, thresholdDb: -38,
      speechSegments: [
        { startMs: 1000, endMs: 2000, durationMs: 1000 },
        { startMs: 3000, endMs: 4000, durationMs: 1000 },
        { startMs: 5000, endMs: 6000, durationMs: 1000 },
        { startMs: 7000, endMs: 8000, durationMs: 1000 },
      ],
      pauseSegments: [
        { startMs: 0, endMs: 1000, durationMs: 1000 },
        { startMs: 2000, endMs: 3000, durationMs: 1000 },
        { startMs: 4000, endMs: 5000, durationMs: 1000 },
        { startMs: 6000, endMs: 7000, durationMs: 1000 },
        { startMs: 8000, endMs: 10000, durationMs: 2000 },
      ],
    }, comparison.actualWordCount), longPauseThresholdMs: 500, durationMs: 10023,
    transcription: { text, processedLocally: true, engine: 'browser-on-device', language: 'en-AU' },
  });
  const errors = buildReadAloudErrorRecords(attempt, comparison);
  const reviews = buildReadAloudReviewItems({ question: item, attempt, errors });
  return { attempt, comparison, errors, reviews };
}

for (const [label, text, categories] of [
  ['perfect', question.transcript, []],
  ['omission', 'Students must arrive nine tomorrow.', ['omission']],
  ['insertion', 'Students really must arrive before nine tomorrow.', ['insertion']],
  ['substitution', 'Teachers must arrive before nine tomorrow.', ['substitution']],
  ['mixed', 'Teachers really must arrive nine tomorrow.', ['substitution', 'insertion', 'omission']],
  ['two omissions and one substitution', 'Students arrive after tomorrow.', ['omission', 'substitution', 'omission']],
]) {
  test(`${label}: observable errors and a single sentence review preserve relationships`, () => {
    const { attempt, comparison, errors, reviews } = outcome(text);
    assert.deepEqual(errors.map(error => error.category), categories);
    assert.equal(errors.length, comparison.missingCount + comparison.extraCount + comparison.substitutionCount);
    assert.equal(reviews.length, categories.length ? 1 : 0);
    const mismatches = comparison.tokens.filter(token => token.status !== 'correct');
    for (const [index, error] of errors.entries()) {
      const token = mismatches[index];
      assert.equal(error.attemptId, attempt.id);
      assert.equal(error.itemId, attempt.itemId);
      assert.equal(error.taskType, 'read-aloud');
      assert.equal(error.createdAt, attempt.createdAt);
      assert.deepEqual(error.skills, ['reading', 'speaking']);
      assert.equal(error.expected, token.expected);
      assert.equal(error.actual, token.actual);
      assert.equal(error.expectedIndex, token.expectedIndex);
      assert.equal(error.actualIndex, token.actualIndex);
      assert.equal(error.token, token.expected ?? token.actual);
      assert.equal(error.severity, 1);
      assert.match(error.explanation, /detected/);
    }
    if (reviews.length) {
      const [review] = reviews;
      assert.equal(review.sourceAttemptId, attempt.id);
      assert.equal(review.itemId, attempt.itemId);
      assert.equal(review.taskType, 'read-aloud');
      assert.equal(review.type, 'sentence');
      assert.equal(review.answer, question.transcript);
      assert.equal('sourceErrorId' in review, false);
      assert.equal(review.createdAt, attempt.createdAt);
      assert.equal(Date.parse(review.dueAt) - Date.parse(attempt.createdAt), 86400000);
      assert.equal(review.intervalDays, 1);
      assert.equal(review.repetitions, 0);
      assert.equal(review.correctStreak, 0);
    }
    assert.equal(new Set(errors.map(error => error.id)).size, errors.length);
  });
}

test('a perfect retry creates a new attempt without changing the earlier remediation', () => {
  const first = outcome('Students must arrive nine tomorrow.');
  const snapshot = structuredClone(first);
  const retry = outcome(question.transcript);
  assert.notEqual(first.attempt.id, retry.attempt.id);
  assert.equal(first.attempt.itemId, retry.attempt.itemId);
  assert.deepEqual(retry.errors, []);
  assert.deepEqual(retry.reviews, []);
  assert.deepEqual(first, snapshot);
});

test('review uses answer fallback and skips missing sentences', () => {
  const item = { ...question, transcript: undefined, answer: question.transcript };
  const { attempt, errors, reviews } = outcome('Students must arrive nine tomorrow.', item);
  assert.equal(reviews[0].answer, item.answer);
  assert.deepEqual(buildReadAloudReviewItems({
    question: { ...item, answer: undefined }, attempt, errors,
  }), []);
});

test('timing-only weakness stays in metrics and does not create durable causal errors', () => {
  const { attempt, errors, reviews } = outcome(question.transcript);
  assert.equal(attempt.score, 1);
  assert.equal(attempt.metrics.longPauseCount, 3);
  assert.ok(attempt.metrics.speechRatio < 0.7);
  assert.deepEqual(errors, []);
  assert.deepEqual(reviews, []);
});

test('recognizer-aware explanations preserve specific detected/expected evidence', () => {
  const { errors } = outcome('Teachers really must arrive nine tomorrow.');
  assert.deepEqual(errors.map(error => error.explanation), [
    '"teachers" was detected instead of "students".',
    'Extra word "really" was detected in the spoken response.',
    'Expected word "before" was not detected in the spoken response.',
  ]);
});

test('repeated imperfect attempts each schedule one review without mutating earlier evidence', () => {
  const first = outcome('Students must arrive nine tomorrow.');
  const snapshot = structuredClone(first);
  const second = outcome('Students must arrive nine tomorrow.');
  assert.equal(first.reviews.length, 1);
  assert.equal(second.reviews.length, 1);
  assert.notEqual(first.reviews[0].id, second.reviews[0].id);
  assert.notEqual(first.errors[0].id, second.errors[0].id);
  assert.deepEqual(first, snapshot);
});
