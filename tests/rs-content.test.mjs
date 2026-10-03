import assert from 'node:assert/strict';
import test from 'node:test';

import { compareRepeatSentence, calculateRepeatSentenceMetrics, analyseRepeatSentenceChunks, RsChunkMetadataError } from '../src/domain/scoring/repeat-sentence/index.ts';
import { repeatSentenceQuestions } from '../src/data/question-bank/repeat-sentence.ts';
import { compareWfdAnswer } from '../src/domain/scoring/wfd/compareWfdAnswer.ts';

const expected = 'The research team will publish its findings next month.';
const chunks = ['The research team', 'will publish its findings', 'next month'];
const evaluate = actual => {
  const comparison = compareRepeatSentence(expected, actual);
  return { comparison, score: calculateRepeatSentenceMetrics(comparison), analysis: analyseRepeatSentenceChunks(comparison, chunks) };
};

for (const [name, actual] of [['exact', expected], ['case/punctuation', expected.toLowerCase().replace('.', '')], ['whitespace', ' The   research team\nwill publish its findings next month. ']]) {
  test(`${name}: exact content with full sequence and chunks retained`, () => {
    const { comparison, score, analysis } = evaluate(actual);
    assert.equal(score.contentRecall, 1);
    assert.equal(score.contentRecallPercent, 100);
    assert.equal(score.sequenceAccuracy, 1);
    assert.equal(score.exactContentMatch, true);
    assert.equal(score.totalErrors, 0);
    assert.equal(analysis.retainedChunks, 3);
    assert.equal(analysis.chunkRetention, 1);
    assert.equal(comparison.actualRaw, actual);
    assert.equal(comparison.expectedRaw, expected);
  });
}

test('activity example omission realigns later words and only weakens its chunk', () => {
  const { comparison, score, analysis } = evaluate('The research team will publish findings next month');
  assert.equal(comparison.missingCount, 1);
  assert.deepEqual(comparison.tokens.find(t => t.status === 'missing'), { status: 'missing', expected: 'its', expectedIndex: 5 });
  assert.equal(score.contentRecallPercent, 88.89);
  assert.equal(score.contentRecall, 8 / 9);
  assert.equal(score.missingRate, 1 / 9);
  assert.deepEqual(analysis.chunks.map(c => c.recallPercent), [100, 75, 100]);
  assert.equal(analysis.chunkRetentionPercent, 66.67);
  assert.equal(analysis.retainedChunks, 2);
});

test('substitution preserves lexical distinctions and affected position', () => {
  const { comparison, score, analysis } = evaluate('The research team must publish its findings next month');
  assert.equal(comparison.substitutionCount, 1);
  assert.equal(score.substitutionRate, 1 / 9);
  assert.equal(score.exactContentMatch, false);
  assert.equal(analysis.chunks[1].correctWords, 3);
  assert.ok(comparison.tokens.some(t => t.status === 'substitution' && t.expected === 'will' && t.actual === 'must'));
  for (const [a, b] of [['students', 'student'], ['nine', '9'], ['will publish', 'publishes']]) {
    assert.equal(calculateRepeatSentenceMetrics(compareRepeatSentence(a, b)).exactContentMatch, false);
  }
});

test('extras do not reduce recall or intact chunk retention but defeat exact match', () => {
  const { comparison, score, analysis } = evaluate('The research team really will publish its findings next month');
  assert.equal(comparison.extraCount, 1);
  assert.equal(score.contentRecallPercent, 100);
  assert.equal(score.extraRate, 1 / 9);
  assert.equal(score.totalErrors, 1);
  assert.equal(score.exactContentMatch, false);
  assert.equal(analysis.retainedChunks, 3);
});

test('global order-sensitive alignment is reused, not independent chunk matching', () => {
  const actual = 'next month The research team will publish its findings';
  const { comparison, score, analysis } = evaluate(actual);
  assert.ok(score.sequenceAccuracy < 1);
  assert.equal(score.sequenceAccuracy, score.contentRecall);
  assert.equal(score.exactContentMatch, false);
  assert.ok(analysis.retainedChunks < 3);
  assert.deepEqual(comparison.tokens, compareWfdAnswer(expected, actual).tokens);
});

test('repeated words are credited only at their globally aligned expected position', () => {
  const comparison = compareRepeatSentence('the cat and the dog', 'the cat and dog');
  const analysis = analyseRepeatSentenceChunks(comparison, ['the cat', 'and the dog']);
  assert.deepEqual(analysis.chunks.map(c => c.correctWords), [2, 2]);
  assert.deepEqual(analysis.chunks.map(c => c.retained), [true, false]);
});

test('invalid chunk metadata fails safely instead of scoring fabricated spans', () => {
  const comparison = compareRepeatSentence(expected, expected);
  for (const invalid of [[], [''], ['The research team', 'will publish findings', 'next month'], [...chunks, 'month'], [...chunks].reverse()]) {
    assert.throws(() => analyseRepeatSentenceChunks(comparison, invalid), RsChunkMetadataError);
  }
});

test('domain empty inputs are finite with no exact-content match; all missing is zero', () => {
  for (const [a, b] of [['', ''], ['', 'hello'], [expected, '']]) {
    const score = calculateRepeatSentenceMetrics(compareRepeatSentence(a, b));
    assert.equal(score.contentRecall, 0);
    assert.equal(score.exactContentMatch, false);
    for (const value of Object.values(score)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
  }
  const { analysis } = evaluate('');
  assert.equal(analysis.retainedChunks, 0);
  assert.equal(analysis.chunkRetention, 0);
});

test('domain analysis is deterministic and never mutates input data', () => {
  const comparison = compareRepeatSentence(expected, expected);
  const copy = structuredClone(comparison);
  const originalChunks = [...chunks];
  assert.deepEqual(analyseRepeatSentenceChunks(comparison, chunks), analyseRepeatSentenceChunks(comparison, chunks));
  calculateRepeatSentenceMetrics(comparison);
  assert.deepEqual(comparison, copy);
  assert.deepEqual(chunks, originalChunks);
});

test('all seeded RS questions have valid chunk spans and perfect results', () => {
  for (const question of repeatSentenceQuestions) {
    const comparison = compareRepeatSentence(question.transcript, question.transcript);
    const analysis = analyseRepeatSentenceChunks(comparison, question.chunks);
    assert.equal(analysis.retainedChunks, question.chunks.length);
    assert.equal(analysis.chunks.reduce((sum, c) => sum + c.expectedWords, 0), comparison.expectedWordCount);
  }
});
