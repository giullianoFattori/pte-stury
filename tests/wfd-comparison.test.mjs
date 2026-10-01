import assert from 'node:assert/strict';
import test from 'node:test';

import { compareTokens } from '../src/domain/scoring/wfd/compareTokens.ts';
import { compareWfdAnswer } from '../src/domain/scoring/wfd/compareWfdAnswer.ts';
import { normalizeText } from '../src/domain/scoring/wfd/normalizeText.ts';
import { tokenizeText } from '../src/domain/scoring/wfd/tokenizeText.ts';

const sentence = 'Students should submit their assignments before Friday.';

test('normalization handles Unicode, apostrophes, punctuation and whitespace', () => {
  assert.equal(normalizeText('  ＳＴＵＤＥＮＴＳ\tshould\nsubmit.  '), 'students should submit');
  assert.equal(normalizeText('“Don’t” ‘expand’ contractions!'), '“don\'t” \'expand\' contractions');
  assert.equal(normalizeText('"Hello, world! Is this: a test; yes?"'), 'hello world is this a test yes');
  assert.equal(normalizeText("Students shouldn't re-order words."), "students shouldn't re-order words");
});

test('tokenization returns normalized words and handles empty text', () => {
  assert.deepEqual(tokenizeText('Students should submit.'), ['students', 'should', 'submit']);
  assert.deepEqual(tokenizeText(' \n\t '), []);
  assert.deepEqual(tokenizeText('.,!?;:"'), []);
});

for (const [label, actual] of [
  ['exact', sentence],
  ['case differences', sentence.toUpperCase()],
  ['missing punctuation', sentence.slice(0, -1)],
  ['repeated spaces', '  Students  should\tsubmit their\nassignments before Friday.  '],
]) {
  test(label + ' matches all seven words', () => {
    const result = compareWfdAnswer(sentence, actual);
    assert.deepEqual(
      [result.correctCount, result.missingCount, result.extraCount, result.substitutionCount],
      [7, 0, 0, 0],
    );
    assert.equal(result.expectedRaw, sentence);
    assert.equal(result.actualRaw, actual);
    assert.equal(result.actualNormalized, 'students should submit their assignments before friday');
    assert.equal(result.expectedWordCount, 7);
    assert.equal(result.actualWordCount, 7);
  });
}

test('missing word realigns later tokens and preserves indexes', () => {
  const result = compareWfdAnswer(sentence, 'Students should submit assignments before Friday.');
  assert.deepEqual(result.tokens[3], { status: 'missing', expected: 'their', expectedIndex: 3 });
  assert.deepEqual(result.tokens[4], {
    status: 'correct', expected: 'assignments', actual: 'assignments', expectedIndex: 4, actualIndex: 3,
  });
  assert.deepEqual([result.correctCount, result.missingCount, result.extraCount, result.substitutionCount], [6, 1, 0, 0]);
});

test('extra word realigns later tokens and preserves indexes', () => {
  const result = compareWfdAnswer(sentence, 'Students should quickly submit their assignments before Friday.');
  assert.deepEqual(result.tokens[2], { status: 'extra', actual: 'quickly', actualIndex: 2 });
  assert.deepEqual(result.tokens[3], {
    status: 'correct', expected: 'submit', actual: 'submit', expectedIndex: 2, actualIndex: 3,
  });
  assert.deepEqual([result.correctCount, result.missingCount, result.extraCount, result.substitutionCount], [7, 0, 1, 0]);
});

for (const [label, actual, expectedWord, actualWord, index] of [
  ['substitution', 'Students must submit their assignments before Friday.', 'should', 'must', 1],
  ['singular/plural', 'Student should submit their assignments before Friday.', 'students', 'student', 0],
]) {
  test(label + ' stays different without fuzzy matching', () => {
    const result = compareWfdAnswer(sentence, actual);
    assert.deepEqual(result.tokens[index], {
      status: 'substitution', expected: expectedWord, actual: actualWord, expectedIndex: index, actualIndex: index,
    });
    assert.deepEqual([result.correctCount, result.missingCount, result.extraCount, result.substitutionCount], [6, 0, 0, 1]);
  });
}

test('combined substitution and omission matches the activity example', () => {
  const result = compareWfdAnswer(sentence, 'Student should submit assignments before Friday.');
  assert.deepEqual(result.tokens.map(token => token.status), [
    'substitution', 'correct', 'correct', 'missing', 'correct', 'correct', 'correct',
  ]);
  assert.deepEqual([result.correctCount, result.missingCount, result.extraCount, result.substitutionCount], [5, 1, 0, 1]);
});

test('empty answers are all missing, empty expected sentences are all extra', () => {
  assert.equal(compareWfdAnswer(sentence, '').missingCount, 7);
  assert.equal(compareWfdAnswer('', sentence).extraCount, 7);
  const empty = compareWfdAnswer('', '');
  assert.deepEqual(empty.tokens, []);
  assert.equal(empty.expectedWordCount, 0);
  assert.equal(empty.actualWordCount, 0);
});

test('reordered words never count as fully correct', () => {
  const result = compareWfdAnswer(sentence, 'Students submit should their assignments before Friday.');
  assert.ok(result.correctCount < result.expectedWordCount);
  assert.ok(result.missingCount + result.extraCount + result.substitutionCount > 0);
});

test('repeated words and trailing omissions/additions retain their indexes', () => {
  assert.deepEqual(compareTokens(['the', 'the', 'library'], ['the', 'library']), [
    { status: 'correct', expected: 'the', actual: 'the', expectedIndex: 0, actualIndex: 0 },
    { status: 'missing', expected: 'the', expectedIndex: 1 },
    { status: 'correct', expected: 'library', actual: 'library', expectedIndex: 2, actualIndex: 1 },
  ]);
  assert.deepEqual(compareTokens(['a', 'b'], ['a']).at(-1), { status: 'missing', expected: 'b', expectedIndex: 1 });
  assert.deepEqual(compareTokens(['a'], ['a', 'b']).at(-1), { status: 'extra', actual: 'b', actualIndex: 1 });
});

test('equal LCS branches deterministically choose substitution in v1', () => {
  const expected = ['a', 'b'];
  const actual = ['b', 'a'];
  const result = compareTokens(expected, actual);
  assert.deepEqual(result.map(token => token.status), ['substitution', 'substitution']);
  assert.deepEqual(compareTokens(expected, actual), result);
  assert.deepEqual(expected, ['a', 'b']);
  assert.deepEqual(actual, ['b', 'a']);
});

test('every token is consumed once in order and count totals reconcile', () => {
  const sequences = [''];
  for (let length = 1; length <= 4; length++) {
    for (let mask = 0; mask < 2 ** length; mask++) {
      sequences.push(Array.from({ length }, (_, i) => mask & (1 << i) ? 'a' : 'b').join(' '));
    }
  }
  for (const expected of sequences) {
    for (const actual of sequences) {
      const result = compareWfdAnswer(expected, actual);
      const expectedSide = result.tokens.filter(token => token.expectedIndex !== undefined);
      const actualSide = result.tokens.filter(token => token.actualIndex !== undefined);
      assert.deepEqual(expectedSide.map(token => token.expected), result.expectedTokens);
      assert.deepEqual(actualSide.map(token => token.actual), result.actualTokens);
      assert.deepEqual(expectedSide.map(token => token.expectedIndex), result.expectedTokens.map((_, i) => i));
      assert.deepEqual(actualSide.map(token => token.actualIndex), result.actualTokens.map((_, i) => i));
      assert.equal(result.correctCount + result.missingCount + result.substitutionCount, result.expectedWordCount);
      assert.equal(result.correctCount + result.extraCount + result.substitutionCount, result.actualWordCount);
      for (const token of result.tokens.filter(token => token.status === 'correct')) {
        assert.equal(token.actual, token.expected);
      }
    }
  }
});
