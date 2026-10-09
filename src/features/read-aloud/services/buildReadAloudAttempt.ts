import type { Attempt, StudyItem } from '../../../domain/pte/types';
import type {
  ReadAloudComparisonResult, ReadAloudContentMetrics, ReadAloudFluencyMetrics,
} from '../../../domain/scoring/read-aloud';
import { tokenizeText } from '../../../domain/scoring/shared/tokenizeText.ts';
import type { TranscriptionResult } from '../../../domain/speech/types';

type BuildReadAloudAttemptInput = {
  question: StudyItem;
  transcription: TranscriptionResult;
  comparison: ReadAloudComparisonResult;
  contentMetrics: ReadAloudContentMetrics;
  fluencyMetrics: ReadAloudFluencyMetrics;
  longPauseThresholdMs: number;
  durationMs: number;
};

export function buildReadAloudAttempt({
  question, transcription, comparison, contentMetrics, fluencyMetrics, longPauseThresholdMs, durationMs,
}: BuildReadAloudAttemptInput): Attempt {
  if (question.taskType !== 'read-aloud' || transcription.processedLocally !== true) {
    throw new Error('Only locally transcribed Read Aloud responses can be saved.');
  }
  if (!tokenizeText(transcription.text).length || !Number.isFinite(durationMs) || durationMs < 0
    || contentMetrics.textCoverage < 0 || contentMetrics.textCoverage > 1) {
    throw new Error('A usable transcript, valid duration and content coverage are required.');
  }
  const metrics: NonNullable<Attempt['metrics']> = {
    textCoverage: contentMetrics.textCoverage,
    textCoveragePercent: contentMetrics.textCoveragePercent,
    correctWords: contentMetrics.correctWords,
    expectedWords: contentMetrics.expectedWords,
    actualWords: contentMetrics.actualWords,
    missingCount: comparison.missingCount,
    extraCount: comparison.extraCount,
    substitutionCount: comparison.substitutionCount,
    omissionRate: contentMetrics.omissionRate,
    insertionRate: contentMetrics.insertionRate,
    substitutionRate: contentMetrics.substitutionRate,
    totalErrors: contentMetrics.totalErrors,
    exactTextMatch: contentMetrics.exactTextMatch,
    audioDecodedDurationMs: fluencyMetrics.recordingDurationMs,
    responseLatencyMs: fluencyMetrics.responseLatencyMs,
    endingSilenceMs: fluencyMetrics.endingSilenceMs,
    activeWindowMs: fluencyMetrics.activeWindowMs,
    speechDurationMs: fluencyMetrics.speechDurationMs,
    interiorPauseDurationMs: fluencyMetrics.interiorPauseDurationMs,
    speechRatio: fluencyMetrics.speechRatio,
    speechRatioPercent: fluencyMetrics.speechRatioPercent,
    pauseCount: fluencyMetrics.pauseCount,
    longPauseCount: fluencyMetrics.longPauseCount,
    longPauseThresholdMs,
    averagePauseMs: fluencyMetrics.averagePauseMs,
    longestPauseMs: fluencyMetrics.longestPauseMs,
    hasSpeech: fluencyMetrics.hasSpeech,
    ...(fluencyMetrics.detectedWordCount === undefined ? {} : { detectedWordCount: fluencyMetrics.detectedWordCount }),
    ...(fluencyMetrics.speechRateWpm === undefined ? {} : { speechRateWpm: fluencyMetrics.speechRateWpm }),
    ...(transcription.confidence === undefined ? {} : { sttConfidence: transcription.confidence }),
    processedLocally: transcription.processedLocally,
  };
  if (Object.values(metrics).some(value => typeof value !== 'boolean'
    && (typeof value !== 'number' || !Number.isFinite(value) || value < 0))) {
    throw new Error('Read Aloud metrics must contain finite, non-negative numbers or booleans.');
  }
  return {
    id: crypto.randomUUID(), itemId: question.id, taskType: 'read-aloud',
    createdAt: new Date().toISOString(), responseText: transcription.text,
    durationMs, score: contentMetrics.textCoverage, metrics,
  };
}
