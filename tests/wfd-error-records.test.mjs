import assert from 'node:assert/strict';
import test from 'node:test';

import { compareWfdAnswer } from '../src/domain/scoring/wfd/compareWfdAnswer.ts';
import { buildWfdErrorRecords } from '../src/features/write-from-dictation/services/buildWfdErrorRecords.ts';

const attempt = {
  id: 'attempt-test', itemId: 'wfd-001', taskType: 'write-from-dictation',
  createdAt: '2026-10-02T07:30:00.000Z',
};
const expected = 'Students should submit their assignments before Friday.';

test('perfect normalized answers produce zero errors', () => {
  assert.deepEqual(buildWfdErrorRecords(attempt, compareWfdAnswer(expected, expected.toUpperCase())), []);
});

for (const [name, actual, category, token, expectedValue, actualValue, expectedIndex, actualIndex, explanation] of [
  ['omission', 'Students should submit assignments before Friday.', 'omission', 'their', 'their', undefined, 3, undefined, 'Expected word "their" was missing from the response.'],
  ['insertion', 'Students should quickly submit their assignments before Friday.', 'insertion', 'quickly', undefined, 'quickly', undefined, 2, 'Extra word "quickly" was added to the response.'],
  ['substitution', 'Students must submit their assignments before Friday.', 'substitution', 'should', 'should', 'must', 1, 1, '"must" was used instead of "should".'],
]) {
  test(name + ' preserves values, positions and event context', () => {
    const records = buildWfdErrorRecords(attempt, compareWfdAnswer(expected, actual));
    assert.equal(records.length, 1);
    const { id, ...record } = records[0];
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.deepEqual(record, {
      attemptId: attempt.id, itemId: attempt.itemId, taskType: attempt.taskType,
      skills: ['listening', 'writing'], category, token,
      expected: expectedValue, actual: actualValue, expectedIndex, actualIndex,
      explanation, severity: 1, createdAt: attempt.createdAt,
    });
  });
}

test('mixed errors yield one unique record per non-correct token', () => {
  const comparison = compareWfdAnswer(expected, 'Student should quickly submit assignments before Friday.');
  const snapshot = structuredClone(comparison);
  const records = buildWfdErrorRecords(attempt, comparison);
  assert.equal(records.length, comparison.missingCount + comparison.extraCount + comparison.substitutionCount);
  assert.deepEqual(records.map(record => record.category), ['substitution', 'insertion', 'omission']);
  assert.equal(new Set(records.map(record => record.id)).size, records.length);
  assert.deepEqual(comparison, snapshot);
});

test('repeated omitted words remain separate events at separate positions', () => {
  const records = buildWfdErrorRecords(attempt, compareWfdAnswer('the cat and the dog', 'cat and dog'));
  assert.equal(records.length, 2);
  assert.deepEqual(records.map(record => record.expectedIndex), [0, 3]);
  assert.ok(records.every(record => record.category === 'omission' && record.token === 'the'));
  assert.notEqual(records[0].id, records[1].id);
});

test('misspellings and singular/plural differences remain surface substitutions', () => {
  for (const actual of ['student', 'studens']) {
    const records = buildWfdErrorRecords(attempt, compareWfdAnswer('students', actual));
    assert.equal(records[0].category, 'substitution');
    assert.deepEqual(records[0].skills, ['listening', 'writing']);
  }
});

test('repeated attempts keep separate identities and timestamps', () => {
  const comparison = compareWfdAnswer(expected, 'Student should submit assignments before Friday.');
  const nextAttempt = { ...attempt, id: 'attempt-next', createdAt: '2026-10-03T07:30:00.000Z' };
  const first = buildWfdErrorRecords(attempt, comparison);
  const next = buildWfdErrorRecords(nextAttempt, comparison);
  assert.ok(first.every(record => record.attemptId === attempt.id && record.createdAt === attempt.createdAt));
  assert.ok(next.every(record => record.attemptId === nextAttempt.id && record.createdAt === nextAttempt.createdAt));
  assert.equal(new Set([...first, ...next].map(record => record.id)).size, first.length + next.length);
});
