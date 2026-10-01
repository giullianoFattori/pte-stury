import type { WfdComparisonResult, WfdScoreResult } from './types';

function divideSafely(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function calculateWfdMetrics(comparison: WfdComparisonResult): WfdScoreResult {
  const expectedWords = comparison.expectedWordCount;
  const wordAccuracy = divideSafely(comparison.correctCount, expectedWords);

  return {
    correctWords: comparison.correctCount,
    expectedWords,
    actualWords: comparison.actualWordCount,
    wordAccuracy,
    wordAccuracyPercent: Number((wordAccuracy * 100).toFixed(2)),
    missingRate: divideSafely(comparison.missingCount, expectedWords),
    extraRate: divideSafely(comparison.extraCount, expectedWords),
    substitutionRate: divideSafely(comparison.substitutionCount, expectedWords),
    totalErrors: comparison.missingCount + comparison.extraCount + comparison.substitutionCount,
    exactMatch: expectedWords > 0
      && comparison.correctCount === expectedWords
      && comparison.missingCount === 0
      && comparison.extraCount === 0
      && comparison.substitutionCount === 0,
  };
}
