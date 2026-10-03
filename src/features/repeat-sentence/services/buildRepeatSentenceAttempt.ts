import type { Attempt, StudyItem } from '../../../domain/pte/types';
import type {
  RepeatSentenceComparisonResult, RepeatSentenceScoreResult, RsChunkAnalysis,
} from '../../../domain/scoring/repeat-sentence';
import type { TranscriptionResult } from '../../../domain/speech/types';

type BuildRepeatSentenceAttemptInput = {
  question: StudyItem;
  transcription: TranscriptionResult;
  comparison: RepeatSentenceComparisonResult;
  score: RepeatSentenceScoreResult;
  chunkAnalysis: RsChunkAnalysis | null;
  durationMs: number;
};

export function buildRepeatSentenceAttempt({
  question, transcription, comparison, score, chunkAnalysis, durationMs,
}: BuildRepeatSentenceAttemptInput): Attempt {
  if (question.taskType !== 'repeat-sentence' || transcription.processedLocally !== true) {
    throw new Error('Only locally transcribed Repeat Sentence responses can be saved.');
  }
  return {
    id: crypto.randomUUID(),
    itemId: question.id,
    taskType: 'repeat-sentence',
    createdAt: new Date().toISOString(),
    responseText: transcription.text,
    durationMs,
    score: score.contentRecall,
    metrics: {
      contentRecall: score.contentRecall,
      contentRecallPercent: score.contentRecallPercent,
      sequenceAccuracy: score.sequenceAccuracy,
      sequenceAccuracyPercent: score.sequenceAccuracyPercent,
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
      exactContentMatch: score.exactContentMatch,
      // Zero totalChunks signals unavailable analysis, not failure to recall valid chunks.
      chunkRetention: chunkAnalysis?.chunkRetention ?? 0,
      chunkRetentionPercent: chunkAnalysis?.chunkRetentionPercent ?? 0,
      retainedChunks: chunkAnalysis?.retainedChunks ?? 0,
      totalChunks: chunkAnalysis?.totalChunks ?? 0,
      sttConfidence: transcription.confidence ?? 0,
      processedLocally: transcription.processedLocally,
    },
  };
}
