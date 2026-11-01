import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { scoreReadingFillBlanksDragDrop } from '../src/domain/scoring/reading-fill-blanks-drag-drop/index.ts';
import { parseTaskData } from '../src/domain/content/taskDataValidation.ts';
import { ContentValidationError } from '../src/domain/content/validationTypes.ts';
import { buildReadingFillBlanksDragDropAttempt } from '../src/features/reading-fill-blanks-drag-drop/services/buildReadingFillBlanksDragDropAttempt.ts';
import { buildReadingFillBlanksDragDropErrorRecords } from '../src/features/reading-fill-blanks-drag-drop/services/buildReadingFillBlanksDragDropErrorRecords.ts';
import { buildReadingFillBlanksDragDropReviewItems } from '../src/features/reading-fill-blanks-drag-drop/services/buildReadingFillBlanksDragDropReviewItems.ts';
import { buildSessionSummary } from '../src/domain/study-session/summary.ts';

const blanks = [{ id: 'one', answer: 'public' }, { id: 'two', answer: 'formal' }, { id: 'three', answer: 'shared' }];
const bank = ['public', 'formal', 'shared', 'private', 'casual'];
const data = { segments: ['A ', ' library provides ', ' spaces and ', ' collections.'], blanks, wordBank: bank };
const item = { id: 'rfbdd-000001', taskType: 'reading-fill-blanks-drag-drop', difficulty: 2, prompt: 'Complete the passage.', revision: 3, status: 'active', source: 'internal', createdAt: '2026-10-01T00:00:00.000Z', taskData: data };
const response = answers => scoreReadingFillBlanksDragDrop(blanks, answers, bank);

test('drag-and-drop scorer awards exact +1/0 per blank, distinguishing wrong and unanswered', () => {
  assert.equal(response({ one: 'public', two: 'formal', three: 'shared' }).accuracy, 1);
  assert.deepEqual([response({ one: 'formal', two: 'private', three: 'casual' }).correctCount, response({ one: 'formal', two: 'private', three: 'casual' }).incorrectCount], [0, 3]);
  const mixed = response({ one: 'public', two: 'casual', three: '' });
  assert.deepEqual([mixed.rawScore, mixed.maxScore, mixed.correctCount, mixed.incorrectCount, mixed.unansweredCount, mixed.accuracy], [1, 3, 1, 1, 1, 1 / 3]);
  assert.equal(mixed.exactAllCorrect, false);
});

test('assignment scorer rejects unknown blank/value and duplicate use of a bank word', () => {
  assert.throws(() => response({ one: 'public', two: 'public', three: 'shared' }), /more than one/);
  assert.throws(() => response({ one: 'public', two: 'formal', unknown: '' }), /authored blank IDs/);
  assert.throws(() => response({ one: 'public', two: 'formal', three: 'unknown' }), /invalid selected value/);
  assert.throws(() => scoreReadingFillBlanksDragDrop([{ id: 'x', answer: 'x' }], { x: 'x' }, ['x']), /with distractors/);
});

test('published content accepts exactly 80 words and rejects 81, duplicate banks and missing distractors', () => {
  const exact = { segments: ['first ', ' tail'], blanks: [{ id: 'gap', answer: 'answer' }], wordBank: ['answer', 'distractor'] };
  const body = Array(78).fill('word').join(' ');
  assert.doesNotThrow(() => parseTaskData('reading-fill-blanks-drag-drop', { ...exact, segments: [body + ' ', ' tail'] }, true));
  assert.throws(() => parseTaskData('reading-fill-blanks-drag-drop', { ...exact, segments: [body + ' word ', ' tail'] }, true), ContentValidationError);
  assert.throws(() => parseTaskData('reading-fill-blanks-drag-drop', { ...exact, wordBank: ['answer', 'ANSWER'] }, true), ContentValidationError);
  assert.throws(() => parseTaskData('reading-fill-blanks-drag-drop', { ...exact, wordBank: ['answer'] }, true), ContentValidationError);
  assert.throws(() => parseTaskData('reading-fill-blanks-drag-drop', { ...exact, segments: ['only'], blanks: [{ id: 'gap', answer: 'answer' }, { id: 'gap', answer: 'distractor' }], wordBank: ['answer', 'distractor', 'third'] }, true), ContentValidationError);
});

test('five authored learner items have short coherent passages, unique one-use bank words and distractors', async () => {
  for (let i = 1; i <= 5; i++) {
    const item = JSON.parse(await readFile(new URL(`../content/reading-fill-blanks-drag-drop/rfbdd-${String(i).padStart(6, '0')}.json`, import.meta.url), 'utf8'));
    const parsed = parseTaskData('reading-fill-blanks-drag-drop', item.taskData, true);
    assert.equal(parsed.segments.length, parsed.blanks.length + 1);
    assert.ok(parsed.wordBank.length > parsed.blanks.length);
    assert.equal(new Set(parsed.wordBank.map(word => word.toLocaleLowerCase('en'))).size, parsed.wordBank.length);
    assert.ok(parsed.blanks.every(blank => parsed.wordBank.includes(blank.answer)));
    const passage = parsed.segments.map((segment, index) => segment + (parsed.blanks[index]?.answer ?? '')).join('');
    assert.ok(passage.trim().split(/\s+/u).length <= 80);
  }
});

test('Attempt persists stable blank IDs, exact metrics and revision; errors/reviews stay bounded', () => {
  const attempt = buildReadingFillBlanksDragDropAttempt({ question: item, assignments: { one: 'public', two: 'private', three: '' }, durationMs: 1234 });
  assert.equal(attempt.taskType, item.taskType); assert.equal(attempt.itemRevision, 3); assert.equal(attempt.durationMs, 1234); assert.equal(attempt.score, 1 / 3);
  assert.deepEqual(attempt.responseData, { kind: 'blank-choice', answers: { one: 'public', two: 'private', three: '' } });
  assert.deepEqual([attempt.metrics.rawScore, attempt.metrics.maxScore, attempt.metrics.correctBlanks, attempt.metrics.incorrectBlanks, attempt.metrics.unansweredBlanks, attempt.metrics.totalBlanks], [1, 3, 1, 1, 1, 3]);
  const errors = buildReadingFillBlanksDragDropErrorRecords(item, attempt); assert.deepEqual(errors.map(error => error.category), ['vocabulary', 'omission']);
  const reviews = buildReadingFillBlanksDragDropReviewItems(item, attempt, errors); assert.equal(reviews.length, 2); assert.ok(reviews.every(review => review.prompt.includes('[____]')));
  assert.throws(() => buildReadingFillBlanksDragDropAttempt({ question: { ...item, taskType: 'reading-fill-blanks-dropdown' }, assignments: { one: 'public', two: 'formal', three: 'shared' }, durationMs: 2 }), /Only Reading/);
  assert.throws(() => buildReadingFillBlanksDragDropAttempt({ question: item, assignments: { one: 'public', two: 'public', three: '' }, durationMs: 2 }), /more than one/);
  assert.throws(() => buildReadingFillBlanksDragDropAttempt({ question: item, assignments: { one: 'public', two: 'formal', three: 'shared' }, durationMs: Infinity }), /duration/);
});

test('session summary pools blank counts and fails closed for duplicate assignments', () => {
  const attempt = buildReadingFillBlanksDragDropAttempt({ question: item, assignments: { one: 'public', two: 'private', three: '' }, durationMs: 1234 });
  attempt.id = 'rfbdd-summary-attempt'; attempt.sessionId = 'rfbdd-summary-session';
  const session = { id: attempt.sessionId, mode: 'task', status: 'completed', startedAt: '2026-11-01T00:00:00.000Z', finishedAt: '2026-11-01T00:01:00.000Z', taskTypes: [item.taskType], itemIds: [item.id], currentIndex: 1, attemptIds: [attempt.id], config: { itemCount: 1, taskTypes: [item.taskType] } };
  const result = buildSessionSummary(session, [attempt]).byTask[item.taskType];
  assert.equal(result.questionCount, 1); assert.equal(result.correctBlanks, 1); assert.equal(result.incorrectBlanks, 1); assert.equal(result.unansweredBlanks, 1); assert.equal(result.totalBlanks, 3); assert.ok(Math.abs(result.accuracyPercent - 100 / 3) < 1e-10); assert.equal(result.allCorrectCount, 0);
  const corrupt = structuredClone(attempt); corrupt.responseData.answers.two = 'public';
  assert.throws(() => buildSessionSummary(session, [corrupt]), error => error.code === 'SESSION_SUMMARY_CORRUPT');
});
