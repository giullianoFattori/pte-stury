import assert from 'node:assert/strict';
import test from 'node:test';

import { createInitialReviewSchedule } from '../src/domain/scheduler/createInitialReviewSchedule.ts';
import { compareWfdAnswer } from '../src/domain/scoring/wfd/compareWfdAnswer.ts';
import { buildWfdErrorRecords } from '../src/features/write-from-dictation/services/buildWfdErrorRecords.ts';
import { buildWfdReviewItems } from '../src/features/write-from-dictation/services/buildWfdReviewItems.ts';
import { createWfdClozePrompt } from '../src/features/write-from-dictation/services/createWfdClozePrompt.ts';

const question = {
  id: 'wfd-001', taskType: 'write-from-dictation', difficulty: 1,
  prompt: 'Listen to the sentence and type exactly what you hear.',
  answer: 'Students should submit their assignments before Friday.',
  createdAt: '2026-10-01T00:00:00.000Z',
};
function inputFor(answer) {
  const attempt = {
    id: 'attempt-test', itemId: question.id, taskType: question.taskType,
    responseText: answer, createdAt: '2026-10-02T00:00:00.000Z',
  };
  const errors = buildWfdErrorRecords(attempt, compareWfdAnswer(question.answer, answer));
  return { question, attempt, errors };
}

test('initial schedule is exactly 24 hours later with untouched review counters', () => {
  assert.deepEqual(createInitialReviewSchedule('2026-10-02T00:00:00.000Z'), {
    dueAt: '2026-10-03T00:00:00.000Z', intervalDays: 1, repetitions: 0, correctStreak: 0,
  });
  for (const date of ['2026-12-31T23:30:00.000Z', '2028-02-28T12:00:00.000Z', '2026-10-04T01:30:00+10:00']) {
    assert.equal(Date.parse(createInitialReviewSchedule(date).dueAt) - Date.parse(date), 86400000);
  }
});

test('cloze uses normalized token position including repeated words', () => {
  assert.equal(createWfdClozePrompt(question.answer, 3), 'students should submit ___ assignments before friday');
  assert.equal(createWfdClozePrompt('The cat and the dog.', 3), 'the cat and ___ dog');
  assert.equal(createWfdClozePrompt('The cat and the dog.', 0), '___ cat and the dog');
});

test('invalid cloze positions safely return original text', () => {
  for (const index of [-1, 7, 1.5, NaN, Infinity]) {
    assert.equal(createWfdClozePrompt(question.answer, index), question.answer);
  }
  assert.equal(createWfdClozePrompt('', 0), '');
});

test('perfect attempt creates no reviews', () => {
  assert.deepEqual(buildWfdReviewItems(inputFor(question.answer)), []);
});

for (const [label, answer, expectedAnswer, prompt] of [
  ['omission', 'Students should submit assignments before Friday.', 'their', 'students should submit ___ assignments before friday'],
  ['substitution', 'Student should submit their assignments before Friday.', 'students', '___ should submit their assignments before friday'],
]) {
  test(label + ' creates a linked word retrieval task', () => {
    const input = inputFor(answer);
    const [review] = buildWfdReviewItems(input);
    const { id, ...fields } = review;
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.deepEqual(fields, {
      sourceAttemptId: input.attempt.id, sourceErrorId: input.errors[0].id,
      itemId: question.id, taskType: question.taskType, type: 'word', prompt, answer: expectedAnswer,
      dueAt: '2026-10-03T00:00:00.000Z', intervalDays: 1, repetitions: 0, correctStreak: 0,
      createdAt: input.attempt.createdAt,
    });
  });
}

test('insertion creates sentence correction preserving raw response and expected sentence', () => {
  const answer = ' Students should quickly submit their assignments before Friday.  ';
  const input = inputFor(answer);
  const [review] = buildWfdReviewItems(input);
  assert.equal(review.type, 'sentence');
  assert.equal(review.prompt, `Rewrite the sentence correctly: ${answer}`);
  assert.equal(review.answer, question.answer);
  assert.equal(review.sourceErrorId, input.errors[0].id);
});

test('mixed errors create one review each without mutating source data', () => {
  const input = inputFor('Student should quickly submit assignments before Friday.');
  const snapshot = structuredClone(input);
  const reviews = buildWfdReviewItems(input);
  assert.equal(reviews.length, 3);
  assert.deepEqual(reviews.map(review => review.type), ['word', 'sentence', 'word']);
  assert.deepEqual(reviews.map(review => review.sourceErrorId), input.errors.map(error => error.id));
  assert.equal(new Set(reviews.map(review => review.id)).size, 3);
  assert.deepEqual(input, snapshot);
});

test('repeated mistakes stay separate within and across attempts', () => {
  const customQuestion = { ...question, answer: 'The cat and the dog.' };
  const firstAttempt = { ...inputFor('cat and dog').attempt };
  const nextAttempt = { ...firstAttempt, id: 'attempt-next' };
  const comparison = compareWfdAnswer(customQuestion.answer, firstAttempt.responseText);
  const firstErrors = buildWfdErrorRecords(firstAttempt, comparison);
  const nextErrors = buildWfdErrorRecords(nextAttempt, comparison);
  const first = buildWfdReviewItems({ question: customQuestion, attempt: firstAttempt, errors: firstErrors });
  const next = buildWfdReviewItems({ question: customQuestion, attempt: nextAttempt, errors: nextErrors });
  assert.deepEqual(first.map(review => review.prompt), ['___ cat and the dog', 'the cat and ___ dog']);
  assert.equal(new Set([...first, ...next].map(review => review.id)).size, 4);
  assert.equal(new Set([...first, ...next].map(review => review.sourceErrorId)).size, 4);
  assert.ok(next.every(review => review.sourceAttemptId === 'attempt-next'));
});

test('unsupported and incomplete errors do not create unusable reviews', () => {
  const input = inputFor('Student should submit their assignments before Friday.');
  const error = input.errors[0];
  input.errors = [
    { ...error, category: 'grammar' },
    { ...error, expected: undefined },
    { ...error, expectedIndex: undefined },
    { ...error, expectedIndex: 99 },
  ];
  assert.deepEqual(buildWfdReviewItems(input), []);
  assert.deepEqual(buildWfdReviewItems({ ...input, question: { ...question, answer: undefined } }), []);
  assert.deepEqual(buildWfdReviewItems({ ...input, errors: [{ ...error, category: 'insertion' }], attempt: { ...input.attempt, responseText: undefined } }), []);
});
