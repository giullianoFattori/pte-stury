import { compareReadAloud } from '../../domain/scoring/read-aloud/compareReadAloud.ts';
import { calculateReadAloudMetrics } from '../../domain/scoring/read-aloud/calculateReadAloudMetrics.ts';
import { compareRepeatSentence } from '../../domain/scoring/repeat-sentence/compareRepeatSentence.ts';
import { calculateRepeatSentenceMetrics } from '../../domain/scoring/repeat-sentence/calculateRepeatSentenceMetrics.ts';
import { analyseRepeatSentenceChunks } from '../../domain/scoring/repeat-sentence/analyseRepeatSentenceChunks.ts';

export { measureWordErrors } from './benchmarkWordErrors.ts';

export function comparePocResponse(task: 'ra' | 'rs', expected: string, transcript: string, chunks: readonly string[] = []) {
  if (task === 'ra') {
    const comparison = compareReadAloud(expected, transcript);
    return { comparison, metrics: calculateReadAloudMetrics(comparison) };
  }
  const comparison = compareRepeatSentence(expected, transcript);
  return { comparison, metrics: calculateRepeatSentenceMetrics(comparison),
    chunks: chunks.length ? analyseRepeatSentenceChunks(comparison, chunks) : undefined };
}
