import assert from 'node:assert/strict';
import test from 'node:test';

import { compareRepeatSentence, calculateRepeatSentenceMetrics } from '../src/domain/scoring/repeat-sentence/index.ts';
import { buildRepeatSentenceAttempt } from '../src/features/repeat-sentence/services/buildRepeatSentenceAttempt.ts';
import { buildRepeatSentenceErrorRecords } from '../src/features/repeat-sentence/services/buildRepeatSentenceErrorRecords.ts';
import { buildRepeatSentenceReviewItems } from '../src/features/repeat-sentence/services/buildRepeatSentenceReviewItems.ts';

const question = {
  id: 'rs-001', taskType: 'repeat-sentence', difficulty: 1,
  prompt: 'Listen and repeat.', transcript: 'Students must arrive before nine tomorrow.',
  createdAt: '2026-10-02T00:00:00.000Z',
};

function outcome(text, item = question) {
  const comparison = compareRepeatSentence(item.transcript ?? item.answer, text);
  const attempt = buildRepeatSentenceAttempt({
    question: item, comparison, score: calculateRepeatSentenceMetrics(comparison),
    chunkAnalysis: null, durationMs: 5000,
    transcription: { text, processedLocally: true, engine: 'browser-on-device', language: 'en-AU' },
  });
  const errors = buildRepeatSentenceErrorRecords(attempt, comparison);
  const reviews = buildRepeatSentenceReviewItems({ question: item, attempt, errors });
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
      assert.equal(error.taskType, 'repeat-sentence');
      assert.equal(error.createdAt, attempt.createdAt);
      assert.deepEqual(error.skills, ['listening', 'speaking']);
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
      assert.equal(review.taskType, 'repeat-sentence');
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
  assert.deepEqual(buildRepeatSentenceReviewItems({
    question: { ...item, answer: undefined }, attempt, errors,
  }), []);
});
