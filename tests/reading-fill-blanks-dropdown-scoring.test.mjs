import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreReadingFillBlanksDropdown } from '../src/domain/scoring/reading-fill-blanks-dropdown/score.ts';
import { buildReadingFillBlanksDropdownAttempt } from '../src/features/reading-fill-blanks-dropdown/services/buildReadingFillBlanksDropdownAttempt.ts';
import { buildReadingFillBlanksDropdownErrorRecords } from '../src/features/reading-fill-blanks-dropdown/services/buildReadingFillBlanksDropdownErrorRecords.ts';
import { buildReadingFillBlanksDropdownReviewItems } from '../src/features/reading-fill-blanks-dropdown/services/buildReadingFillBlanksDropdownReviewItems.ts';
import { buildSessionSummary, SESSION_SUMMARY_TASKS } from '../src/domain/study-session/summary.ts';
import { readTaskData, taskDataIssues } from '../src/domain/content/taskDataValidation.ts';
import { readFile } from 'node:fs/promises';

const blanks = [
  { id: 'a', answer: 'access', options: ['access', 'excess'] },
  { id: 'b', answer: 'conducted', options: ['conducted', 'conducting'] },
];

test('dropdown scorer awards exact +1/0 per blank and separates omissions', () => {
  const result = scoreReadingFillBlanksDropdown(blanks, { a: 'access', b: '' });
  assert.deepEqual([result.rawScore, result.maxScore, result.correctCount, result.incorrectCount, result.unansweredCount], [1, 2, 1, 0, 1]);
  assert.equal(result.accuracy, 0.5);
  assert.equal(result.exactAllCorrect, false);
  assert.equal(scoreReadingFillBlanksDropdown(blanks, { a: 'excess', b: 'conducted' }).rawScore, 1);
  assert.equal(scoreReadingFillBlanksDropdown(blanks, { a: 'access', b: 'conducted' }).exactAllCorrect, true);
});

test('dropdown scorer rejects unknown IDs, invalid option values and duplicate authored IDs', () => {
  assert.throws(() => scoreReadingFillBlanksDropdown(blanks, { a: 'access', b: 'conducted', extra: 'access' }));
  assert.throws(() => scoreReadingFillBlanksDropdown(blanks, { a: 'synonym', b: 'conducted' }));
  assert.throws(() => scoreReadingFillBlanksDropdown([{ ...blanks[0] }, { ...blanks[1], id: 'a' }], { a: 'access' }));
});

test('published dropdown contracts include coherent choices and enforce the 200-word ceiling', async () => {
  const files = await Promise.all(Array.from({ length: 5 }, (_, i) => readFile(new URL(`../content/reading-fill-blanks-dropdown/rfbd-${String(i + 1).padStart(6, '0')}.json`, import.meta.url), 'utf8')));
  for (const raw of files) {
    const item = JSON.parse(raw), data = readTaskData(item, 'reading-fill-blanks-dropdown');
    assert.equal(data.segments.length, data.blanks.length + 1);
    assert.ok(data.blanks.every(blank => new Set(blank.options).size === blank.options.length && blank.options.includes(blank.answer)));
  }
  const fixture = JSON.parse(files[0]);
  const exactly200 = structuredClone(fixture.taskData);
  const passage = exactly200.segments.map((segment, index) => segment + (exactly200.blanks[index]?.answer ?? '')).join('');
  const { countWords } = await import('../src/domain/scoring/shared/writing/wordCount.ts');
  const padding = 200 - countWords(passage);
  exactly200.segments[exactly200.segments.length - 1] += ' ' + Array(padding).fill('additional').join(' ');
  assert.equal(taskDataIssues(fixture.taskType, exactly200, true).issues.length, 0);
  const tooLong = structuredClone(exactly200); tooLong.segments[tooLong.segments.length - 1] += ' extra';
  assert.ok(taskDataIssues(fixture.taskType, tooLong, true).issues.some(issue => issue.message.includes('200 words')));
});

test('Attempt persists blank-choice response, revision and normalized partial score', async () => {
  const item = JSON.parse(await readFile(new URL('../content/reading-fill-blanks-dropdown/rfbd-000001.json', import.meta.url), 'utf8'));
  item.revision = 7;
  const data = item.taskData;
  const answers = Object.fromEntries(data.blanks.map((blank, i) => [blank.id, i === 0 ? blank.answer : '']));
  const attempt = buildReadingFillBlanksDropdownAttempt({ question: item, answers, durationMs: 1234 });
  assert.equal(attempt.taskType, 'reading-fill-blanks-dropdown');
  assert.equal(attempt.score, 0.2);
  assert.equal(attempt.itemRevision, 7);
  assert.equal(attempt.durationMs, 1234);
  assert.equal(attempt.metrics.rawScore, 1);
  assert.equal(attempt.metrics.maxScore, 5);
  assert.deepEqual(attempt.responseData, { kind: 'blank-choice', answers });
  assert.throws(() => buildReadingFillBlanksDropdownAttempt({ question: { ...item, taskType: 'reading-fill-blanks-drag-drop' }, answers, durationMs: 1 }));
});

test('dropdown errors/reviews are bounded and completed-session summary pools blank counts', async () => {
  const item = JSON.parse(await readFile(new URL('../content/reading-fill-blanks-dropdown/rfbd-000001.json', import.meta.url), 'utf8'));
  const answers = Object.fromEntries(item.taskData.blanks.map((blank, i) => [blank.id, i === 0 ? blank.options.find(option => option !== blank.answer) : '']));
  const attempt = buildReadingFillBlanksDropdownAttempt({ question: item, answers, durationMs: 500 });
  const errors = buildReadingFillBlanksDropdownErrorRecords(item, attempt);
  const reviews = buildReadingFillBlanksDropdownReviewItems(item, attempt, errors);
  assert.equal(errors.length, 5); assert.equal(reviews.length, 4);
  assert.ok(errors.some(error => error.category === 'omission'));
  assert.ok(reviews.every(review => review.prompt.includes('[____]') && review.answer));
  attempt.id = 'rfbd-summary-attempt'; attempt.sessionId = 'rfbd-summary-session';
  const session = { id: attempt.sessionId, mode: 'task', status: 'completed', startedAt: '2026-11-01T00:00:00.000Z', finishedAt: '2026-11-01T00:01:00.000Z', taskTypes: [item.taskType], itemIds: [item.id], currentIndex: 1, attemptIds: [attempt.id], config: { itemCount: 1, taskTypes: [item.taskType] } };
  const result = buildSessionSummary(session, [attempt]).byTask[item.taskType];
  assert.ok(SESSION_SUMMARY_TASKS.includes(item.taskType));
  assert.equal(result.questionCount, 1); assert.equal(result.correctBlanks, 0); assert.equal(result.incorrectBlanks, 1); assert.equal(result.unansweredBlanks, 4); assert.equal(result.totalBlanks, 5); assert.equal(result.accuracyPercent, 0);
  const corrupt = structuredClone(attempt); corrupt.metrics.rawScore = 1;
  assert.throws(() => buildSessionSummary(session, [corrupt]), error => error.code === 'SESSION_SUMMARY_CORRUPT');
});
