import type { ReadAloudComparisonResult, ReadAloudContentMetrics } from './types';

export function calculateReadAloudMetrics(comparison: ReadAloudComparisonResult): ReadAloudContentMetrics {
  const expectedWords = comparison.expectedWordCount;
  const rate = (count: number) => expectedWords === 0 ? 0 : count / expectedWords;
  const textCoverage = rate(comparison.correctCount);
  return {
    correctWords: comparison.correctCount,
    expectedWords,
    actualWords: comparison.actualWordCount,
    textCoverage,
    textCoveragePercent: Number((textCoverage * 100).toFixed(2)),
    omissionRate: rate(comparison.missingCount),
    insertionRate: rate(comparison.extraCount),
    substitutionRate: rate(comparison.substitutionCount),
    exactTextMatch: expectedWords > 0 && comparison.correctCount === expectedWords
      && comparison.missingCount === 0 && comparison.extraCount === 0 && comparison.substitutionCount === 0,
    totalErrors: comparison.missingCount + comparison.extraCount + comparison.substitutionCount,
  };
}
