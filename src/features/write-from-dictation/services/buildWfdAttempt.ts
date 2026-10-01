import type { Attempt, StudyItem } from '../../../domain/pte/types';
import type { WfdComparisonResult, WfdScoreResult } from '../../../domain/scoring/wfd';

type BuildWfdAttemptInput = {
  question: StudyItem;
  answer: string;
  comparison: WfdComparisonResult;
  score: WfdScoreResult;
  durationMs: number;
};

export function buildWfdAttempt({
  question, answer, comparison, score, durationMs,
}: BuildWfdAttemptInput): Attempt {
  return {
    id: crypto.randomUUID(),
    itemId: question.id,
    taskType: 'write-from-dictation',
    createdAt: new Date().toISOString(),
    responseText: answer,
    durationMs,
    score: score.wordAccuracy,
    metrics: {
      wordAccuracy: score.wordAccuracy,
      wordAccuracyPercent: score.wordAccuracyPercent,
      correctWords: score.correctWords,
      expectedWords: score.expectedWords,
      actualWords: score.actualWords,
      missingCount: comparison.missingCount,
      extraCount: comparison.extraCount,
      substitutionCount: comparison.substitutionCount,
      missingRate: score.missingRate,
      extraRate: score.extraRate,
      substitutionRate: score.substitutionRate,
      totalErrors: score.totalErrors,
      exactMatch: score.exactMatch,
    },
  };
}
