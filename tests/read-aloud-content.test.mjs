import assert from 'node:assert/strict';
import test from 'node:test';

import { readAloudQuestions } from '../src/data/question-bank/read-aloud.ts';
import { normalizeText } from '../src/domain/scoring/shared/normalizeText.ts';
import { tokenizeText } from '../src/domain/scoring/shared/tokenizeText.ts';

test('RA starter bank has six stable IDs and two passages per level 1–3', () => {
  assert.deepEqual(readAloudQuestions.map(item => item.id), [
    'ra-001', 'ra-002', 'ra-003', 'ra-004', 'ra-005', 'ra-006',
  ]);
  assert.deepEqual(readAloudQuestions.map(item => item.difficulty), [1, 1, 2, 2, 3, 3]);
});

for (const item of readAloudQuestions) {
  test(`${item.id} preserves passage order and valid curated stress targets`, () => {
    assert.equal(item.taskType, 'read-aloud');
    assert.equal(item.prompt, 'Read the text aloud clearly and naturally.');
    assert.ok(item.transcript.trim());
    assert.equal(item.answer, item.transcript);
    assert.equal(item.createdAt, '2026-10-04T00:00:00.000Z');
    const expectedTokens = tokenizeText(item.transcript);
    assert.ok(item.phraseGroups.length > 0);
    assert.ok(item.phraseGroups.every(phrase => tokenizeText(phrase).length > 0));
    assert.deepEqual(tokenizeText(item.phraseGroups.join(' ')), expectedTokens);
    assert.ok(item.stressWords.length > 0);
    assert.equal(new Set(item.stressWords.map(normalizeText)).size, item.stressWords.length);
    for (const word of item.stressWords) {
      assert.equal(word, normalizeText(word));
      assert.equal(tokenizeText(word).length, 1);
      assert.ok(expectedTokens.includes(word), `${word} must be a passage token`);
    }
    assert.equal('audioUrl' in item, false);
    assert.equal('chunks' in item, false);
    assert.deepEqual(Object.keys(item).sort(), [
      'id', 'taskType', 'difficulty', 'prompt', 'answer', 'transcript', 'phraseGroups', 'stressWords', 'createdAt',
    ].sort());
  });
}
