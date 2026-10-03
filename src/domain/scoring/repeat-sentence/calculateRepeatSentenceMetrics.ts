import type { RepeatSentenceComparisonResult, RepeatSentenceScoreResult } from './types';

export function calculateRepeatSentenceMetrics(comparison: RepeatSentenceComparisonResult): RepeatSentenceScoreResult {
  const expectedWords = comparison.expectedWordCount;
  const rate = (count: number) => expectedWords === 0 ? 0 : count / expectedWords;
  const contentRecall = rate(comparison.correctCount);
  // V1 recall and sequence accuracy both use globally aligned correct positions.
  const sequenceAccuracy = contentRecall;
  return {
    correctWords: comparison.correctCount,
    expectedWords,
    actualWords: comparison.actualWordCount,
    contentRecall,
    contentRecallPercent: Number((contentRecall * 100).toFixed(2)),
    missingRate: rate(comparison.missingCount),
    extraRate: rate(comparison.extraCount),
    substitutionRate: rate(comparison.substitutionCount),
    sequenceAccuracy,
    sequenceAccuracyPercent: Number((sequenceAccuracy * 100).toFixed(2)),
    totalErrors: comparison.missingCount + comparison.extraCount + comparison.substitutionCount,
    exactContentMatch: expectedWords > 0 && comparison.correctCount === expectedWords
      && comparison.missingCount === 0 && comparison.extraCount === 0 && comparison.substitutionCount === 0,
  };
}
