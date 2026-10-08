import { tokenizeText } from '../../domain/scoring/shared/tokenizeText.ts';
import { compareReadAloud } from '../../domain/scoring/read-aloud/compareReadAloud.ts';
import { calculateReadAloudMetrics } from '../../domain/scoring/read-aloud/calculateReadAloudMetrics.ts';
import { compareRepeatSentence } from '../../domain/scoring/repeat-sentence/compareRepeatSentence.ts';
import { calculateRepeatSentenceMetrics } from '../../domain/scoring/repeat-sentence/calculateRepeatSentenceMetrics.ts';
import { analyseRepeatSentenceChunks } from '../../domain/scoring/repeat-sentence/analyseRepeatSentenceChunks.ts';

// STT benchmark only. Minimum word edit distance; existing learner scoring remains unchanged.
export function measureWordErrors(reference: string, transcript: string) {
  const expected = tokenizeText(reference);
  const actual = tokenizeText(transcript);
  if (!expected.length) throw new Error('A non-empty manually verified reference is required.');
  if (expected.length > 2000 || actual.length > 2000) throw new Error('POC reference/transcript exceeds 2000 words.');
  const matrix = Array.from({ length: expected.length + 1 }, (_, i) =>
    Array.from({ length: actual.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= expected.length; i++) {
    for (let j = 1; j <= actual.length; j++) {
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + (expected[i - 1] === actual[j - 1] ? 0 : 1));
    }
  }
  const missingWords: string[] = [];
  const insertions: string[] = [];
  const substitutions: { expected: string; actual: string }[] = [];
  let i = expected.length;
  let j = actual.length;
  while (i || j) {
    if (i && j && matrix[i][j] === matrix[i - 1][j - 1] + (expected[i - 1] === actual[j - 1] ? 0 : 1)) {
      if (expected[i - 1] !== actual[j - 1]) substitutions.unshift({ expected: expected[i - 1], actual: actual[j - 1] });
      i--; j--;
    } else if (i && matrix[i][j] === matrix[i - 1][j] + 1) {
      missingWords.unshift(expected[--i]);
    } else { insertions.unshift(actual[--j]); }
  }
  return { words: expected.length, S: substitutions.length, D: missingWords.length, I: insertions.length,
    wer: (substitutions.length + missingWords.length + insertions.length) / expected.length,
    missingWords, insertions, substitutions };
}

export function comparePocResponse(task: 'ra' | 'rs', expected: string, transcript: string, chunks: readonly string[] = []) {
  if (task === 'ra') {
    const comparison = compareReadAloud(expected, transcript);
    return { comparison, metrics: calculateReadAloudMetrics(comparison) };
  }
  const comparison = compareRepeatSentence(expected, transcript);
  return { comparison, metrics: calculateRepeatSentenceMetrics(comparison),
    chunks: chunks.length ? analyseRepeatSentenceChunks(comparison, chunks) : undefined };
}
