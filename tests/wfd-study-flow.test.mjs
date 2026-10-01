import assert from 'node:assert/strict';
import test from 'node:test';

import { compareWfdAnswer } from '../src/domain/scoring/wfd/compareWfdAnswer.ts';
import { calculateWfdMetrics } from '../src/domain/scoring/wfd/calculateWfdMetrics.ts';
import { buildWfdAttempt } from '../src/features/write-from-dictation/services/buildWfdAttempt.ts';
import { buildWfdErrorRecords } from '../src/features/write-from-dictation/services/buildWfdErrorRecords.ts';
import { buildWfdReviewItems } from '../src/features/write-from-dictation/services/buildWfdReviewItems.ts';

test('complete WFD mapping preserves all relationships and count invariants', () => {
  const question = {
    id: 'wfd-001', taskType: 'write-from-dictation', difficulty: 1,
    prompt: 'Listen to the sentence and type exactly what you hear.',
    answer: 'Students should submit their assignments before Friday.',
    createdAt: '2026-10-01T00:00:00.000Z',
  };
  const answers = [
    question.answer,
    'Student should quickly submit assignments before Friday.',
    'students    should submit their assignments before friday',
    'Students should their submit assignments before Friday.',
    '',
  ];
  const attemptIds = new Set();
  const errorIds = new Set();
  const reviewIds = new Set();
  for (const answer of answers) {
    const comparison = compareWfdAnswer(question.answer, answer);
    const score = calculateWfdMetrics(comparison);
    const attempt = buildWfdAttempt({ question, answer, comparison, score, durationMs: 5000 });
    const errors = buildWfdErrorRecords(attempt, comparison);
    const reviews = buildWfdReviewItems({ question, attempt, errors });

    assert.equal(attempt.responseText, answer);
    assert.equal(attempt.score, attempt.metrics.wordAccuracy);
    assert.ok(attempt.score >= 0 && attempt.score <= 1);
    assert.equal(attempt.metrics.correctWords + attempt.metrics.missingCount + attempt.metrics.substitutionCount, attempt.metrics.expectedWords);
    assert.equal(attempt.metrics.correctWords + attempt.metrics.extraCount + attempt.metrics.substitutionCount, attempt.metrics.actualWords);
    assert.equal(errors.length, score.totalErrors);
    assert.equal(reviews.length, errors.length);
    assert.equal(attempt.itemId, question.id);
    assert.equal(attemptIds.has(attempt.id), false);
    attemptIds.add(attempt.id);
    if (score.exactMatch) assert.equal(errors.length + reviews.length, 0);

    for (const error of errors) {
      assert.equal(error.attemptId, attempt.id);
      assert.equal(error.itemId, question.id);
      assert.equal(error.createdAt, attempt.createdAt);
      assert.equal(errorIds.has(error.id), false);
      errorIds.add(error.id);
    }
    for (const review of reviews) {
      const error = errors.find(error => error.id === review.sourceErrorId);
      assert.ok(error);
      assert.equal(review.sourceAttemptId, attempt.id);
      assert.equal(review.sourceAttemptId, error.attemptId);
      assert.equal(review.itemId, question.id);
      assert.equal(review.taskType, question.taskType);
      assert.equal(review.createdAt, attempt.createdAt);
      assert.equal(Date.parse(review.dueAt) - Date.parse(review.createdAt), 86400000);
      assert.equal(reviewIds.has(review.id), false);
      reviewIds.add(review.id);
    }
  }
});
