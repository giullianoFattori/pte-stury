import type { Attempt, StudyItem } from '../../../domain/pte/types';
import type { RetellLectureCoverage } from '../../../domain/scoring/retell-lecture';
import type { ReadAloudFluencyMetrics } from '../../../domain/scoring/read-aloud';
import type { TranscriptionResult } from '../../../domain/speech/types';
import { tokenizeText } from '../../../domain/scoring/shared/tokenizeText.ts';

export function buildRetellLectureAttempt(input: { question: StudyItem; transcription: TranscriptionResult; coverage: RetellLectureCoverage; fluencyMetrics: ReadAloudFluencyMetrics; durationMs: number }): Attempt {
  const { question, transcription, coverage, fluencyMetrics, durationMs } = input;
  if (question.taskType !== 'retell-lecture' || transcription.processedLocally !== true) throw new Error('Only locally transcribed Retell Lecture responses can be saved.');
  if (!tokenizeText(transcription.text).length || !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 40_000 || coverage.totalKeyPoints < 1) throw new Error('A usable local transcript, valid response duration and authored key points are required.');
  const metrics: NonNullable<Attempt['metrics']> = {
    keyPointCoverage: coverage.keyPointCoverage, keyPointCoveragePercent: coverage.keyPointCoveragePercent,
    matchedKeyPoints: coverage.matchedKeyPoints, totalKeyPoints: coverage.totalKeyPoints,
    keywordCoverage: coverage.keywordCoverage, keywordCoveragePercent: coverage.keywordCoveragePercent,
    responseWordCount: coverage.responseWordCount, responseLatencyMs: fluencyMetrics.responseLatencyMs,
    speechDurationMs: fluencyMetrics.speechDurationMs, speechRatio: fluencyMetrics.speechRatio,
    speechRatioPercent: fluencyMetrics.speechRatioPercent, pauseCount: fluencyMetrics.pauseCount,
    longPauseCount: fluencyMetrics.longPauseCount, averagePauseMs: fluencyMetrics.averagePauseMs,
    longestPauseMs: fluencyMetrics.longestPauseMs, hasSpeech: fluencyMetrics.hasSpeech,
    ...(!fluencyMetrics.hasSpeech || fluencyMetrics.speechDurationMs <= 0 || fluencyMetrics.speechRateWpm === undefined ? {} : { speechRateWpm: fluencyMetrics.speechRateWpm }),
    ...(transcription.confidence === undefined ? {} : { sttConfidence: transcription.confidence }), processedLocally: true,
  };
  if (Object.values(metrics).some(value => typeof value === 'number' && (!Number.isFinite(value) || value < 0))) throw new Error('Retell Lecture metrics must be finite and non-negative.');
  return { id: crypto.randomUUID(), itemId: question.id, taskType: 'retell-lecture', ...(question.revision === undefined ? {} : { itemRevision: question.revision }), createdAt: new Date().toISOString(), responseText: transcription.text, durationMs, score: coverage.keyPointCoverage, metrics };
}
