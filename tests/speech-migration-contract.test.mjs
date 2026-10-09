import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { toTranscriptionResult } from '../src/domain/speech/runtimeTypes.ts';
import { compareReadAloud, calculateReadAloudMetrics, calculateReadAloudFluency } from '../src/domain/scoring/read-aloud/index.ts';
import { compareRepeatSentence, calculateRepeatSentenceMetrics, analyseRepeatSentenceChunks } from '../src/domain/scoring/repeat-sentence/index.ts';
import { buildReadAloudAttempt } from '../src/features/read-aloud/services/buildReadAloudAttempt.ts';
import { buildReadAloudErrorRecords } from '../src/features/read-aloud/services/buildReadAloudErrorRecords.ts';
import { buildReadAloudReviewItems } from '../src/features/read-aloud/services/buildReadAloudReviewItems.ts';
import { buildRepeatSentenceAttempt } from '../src/features/repeat-sentence/services/buildRepeatSentenceAttempt.ts';
import { buildRepeatSentenceErrorRecords } from '../src/features/repeat-sentence/services/buildRepeatSentenceErrorRecords.ts';
import { buildRepeatSentenceReviewItems } from '../src/features/repeat-sentence/services/buildRepeatSentenceReviewItems.ts';
const expected = 'Students study useful material every day.';
const transcription = toTranscriptionResult({ text: 'Students really study helpful material every.',
  engine: 'whisper.cpp', model: 'base.en', language: 'en', processedLocally: true,
  timing: { audioMs: 5000, inferenceMs: 1000, totalMs: 1200 } });
for (const taskType of ['read-aloud', 'repeat-sentence']) {
  test('native ' + taskType + ' contract integrates comparison, attempt, alignment errors and sentence review', () => {
    const question = { id: taskType + '-controlled', taskType, transcript: expected,
      chunks: ['Students study useful', 'material every day'] };
    let comparison, attempt, errors, reviews;
    if (taskType === 'read-aloud') {
      comparison = compareReadAloud(expected, transcription.text);
      const segment = { startMs: 500, endMs: 4500, durationMs: 4000 };
      const fluencyMetrics = calculateReadAloudFluency({ durationMs: 5000, frames: [], noiseFloorDb: -50,
        thresholdDb: -38, speechSegments: [segment], pauseSegments: [] }, comparison.actualWordCount);
      attempt = buildReadAloudAttempt({ question, transcription, comparison,
        contentMetrics: calculateReadAloudMetrics(comparison), fluencyMetrics,
        longPauseThresholdMs: 500, durationMs: 5000 });
      errors = buildReadAloudErrorRecords(attempt, comparison);
      reviews = buildReadAloudReviewItems({ question, attempt, errors });
      assert.equal(attempt.metrics.speechDurationMs, 4000);
    } else {
      comparison = compareRepeatSentence(expected, transcription.text);
      attempt = buildRepeatSentenceAttempt({ question, transcription, comparison,
        score: calculateRepeatSentenceMetrics(comparison),
        chunkAnalysis: analyseRepeatSentenceChunks(comparison, question.chunks), durationMs: 5000 });
      errors = buildRepeatSentenceErrorRecords(attempt, comparison);
      reviews = buildRepeatSentenceReviewItems({ question, attempt, errors });
      assert.equal(attempt.metrics.totalChunks, 2);
      assert.equal(attempt.metrics.retainedChunks, 0);
    }
    assert.equal(attempt.score, 4 / 6);
    assert.equal(attempt.responseText, transcription.text);
    assert.equal(attempt.metrics.processedLocally, true);
    assert.equal('sttConfidence' in attempt.metrics, false);
    assert.deepEqual(errors.map(e => e.category).sort(), ['insertion', 'omission', 'substitution']);
    assert.ok(errors.every(e => e.attemptId === attempt.id && e.itemId === question.id));
    assert.deepEqual(errors[0].skills, taskType === 'read-aloud' ? ['reading', 'speaking'] : ['listening', 'speaking']);
    assert.equal(reviews.length, 1);
    assert.equal(reviews[0].sourceAttemptId, attempt.id);
    assert.equal(reviews[0].type, 'sentence');
    assert.equal(reviews[0].answer, expected);
  });
}
test('normal app uses production Whisper only; archived POC has a dedicated dev command', async () => {
  const config = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');
  const hook = await readFile(new URL('../src/shared/speech/hooks/useSpeechTranscription.ts', import.meta.url), 'utf8');
  const scripts = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).scripts;
  assert.doesNotMatch(config, /__local-stt|8766/);
  assert.match(hook, /new WhisperCppSpeechToTextAdapter/);
  assert.doesNotMatch(hook, /new BrowserOnDeviceSpeechToTextAdapter|WhisperCppPoc/);
  for (const name of ['whisperPocEntry.tsx', 'whisperPocPage.tsx', 'WhisperCppPocSpeechToTextAdapter.ts']) {
    await assert.rejects(access(new URL('../src/infrastructure/speech/' + name, import.meta.url)));
    await access(new URL('../tools/local-stt/ui/' + name, import.meta.url));
  }
  assert.match(scripts['dev:stt-poc'], /tools\/local-stt\/vite.config.ts/);
});
