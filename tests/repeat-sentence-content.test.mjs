import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { repeatSentenceQuestions } from '../src/data/question-bank/repeat-sentence.ts';
import { writeFromDictationQuestions } from '../src/data/question-bank/write-from-dictation.ts';

const normalizeContent = value => value.toLowerCase().replace(/[.,!?;:"]/g, '').replace(/\s+/g, ' ').trim();

test('starter banks have eleven unique IDs and RS has two items per difficulty', () => {
  const all = [...writeFromDictationQuestions, ...repeatSentenceQuestions];
  assert.equal(all.length, 11);
  assert.equal(new Set(all.map(item => item.id)).size, 11);
  assert.deepEqual(repeatSentenceQuestions.map(item => item.id), [
    'rs-001', 'rs-002', 'rs-003', 'rs-004', 'rs-005', 'rs-006',
  ]);
  assert.deepEqual(repeatSentenceQuestions.map(item => item.difficulty), [1, 1, 2, 2, 3, 3]);
});

for (const item of repeatSentenceQuestions) {
  test(item.id + ' has consistent transcript, chunks, difficulty and local MP3', () => {
    assert.equal(item.taskType, 'repeat-sentence');
    assert.ok(item.prompt);
    assert.ok(item.answer);
    assert.equal(item.answer, item.transcript);
    assert.ok(item.chunks.length >= 2);
    assert.ok(item.chunks.every(chunk => chunk.trim().length > 0));
    assert.equal(normalizeContent(item.chunks.join(' ')), normalizeContent(item.answer));
    const wordCount = item.answer.trim().split(/\s+/).length;
    if (item.difficulty === 1) assert.ok(wordCount >= 5 && wordCount <= 7);
    if (item.difficulty === 2) assert.ok(wordCount >= 8 && wordCount <= 11);
    if (item.difficulty === 3) assert.ok(wordCount >= 12);
    assert.equal(item.audioUrl, `/audio/rs/${item.id}.mp3`);
    assert.equal(new Date(item.createdAt).toISOString(), item.createdAt);
    const audio = readFileSync(new URL(`../public${item.audioUrl}`, import.meta.url));
    assert.ok(audio.length > 1000);
    assert.ok(audio.subarray(0, 3).toString() === 'ID3' || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0));
  });
}
