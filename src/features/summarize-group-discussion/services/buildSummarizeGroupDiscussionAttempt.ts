import type { Attempt, StudyItem } from '../../../domain/pte/types';
import type { SummarizeGroupDiscussionCoverage } from '../../../domain/scoring/summarize-group-discussion';
import type { ReadAloudFluencyMetrics } from '../../../domain/scoring/read-aloud';
import type { TranscriptionResult } from '../../../domain/speech/types';
import { tokenizeText } from '../../../domain/scoring/shared/tokenizeText.ts';

export function buildSummarizeGroupDiscussionAttempt(input: { question: StudyItem; transcription: TranscriptionResult; coverage: SummarizeGroupDiscussionCoverage; fluencyMetrics: ReadAloudFluencyMetrics; durationMs: number }): Attempt {
  const { question, transcription, coverage, fluencyMetrics, durationMs } = input;
  if (question.taskType !== 'summarize-group-discussion' || transcription.processedLocally !== true) throw new Error('Only locally transcribed Summarize Group Discussion responses can be saved.');
  if (!tokenizeText(transcription.text).length || !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 120_000 || coverage.totalKeyPoints < 1 || coverage.totalSpeakers !== 3)
    throw new Error('A usable local transcript, valid response duration and authored discussion points are required.');
  const metrics: NonNullable<Attempt['metrics']> = {
    keyPointCoverage: coverage.keyPointCoverage, keyPointCoveragePercent: coverage.keyPointCoveragePercent,
    matchedKeyPoints: coverage.matchedKeyPoints, totalKeyPoints: coverage.totalKeyPoints,
    speakerCoverage: coverage.speakerCoverage, speakerCoveragePercent: coverage.speakerCoveragePercent,
    representedSpeakers: coverage.representedSpeakers, totalSpeakers: coverage.totalSpeakers,
    ...(coverage.relationshipCoverage === undefined ? {} : {
      relationshipCoverage: coverage.relationshipCoverage, relationshipCoveragePercent: coverage.relationshipCoveragePercent!,
      matchedRelationships: coverage.matchedRelationships!, totalRelationships: coverage.totalRelationships!,
    }),
    responseWordCount: coverage.responseWordCount, responseLatencyMs: fluencyMetrics.responseLatencyMs,
    speechDurationMs: fluencyMetrics.speechDurationMs, speechRatio: fluencyMetrics.speechRatio,
    speechRatioPercent: fluencyMetrics.speechRatioPercent, pauseCount: fluencyMetrics.pauseCount,
    longPauseCount: fluencyMetrics.longPauseCount, averagePauseMs: fluencyMetrics.averagePauseMs,
    longestPauseMs: fluencyMetrics.longestPauseMs, hasSpeech: fluencyMetrics.hasSpeech,
    ...(!fluencyMetrics.hasSpeech || fluencyMetrics.speechDurationMs <= 0 || fluencyMetrics.speechRateWpm === undefined ? {} : { speechRateWpm: fluencyMetrics.speechRateWpm }),
    ...(transcription.confidence === undefined ? {} : { sttConfidence: transcription.confidence }), processedLocally: true,
  };
  for (const [key, value] of Object.entries(metrics)) if (typeof value === 'number' && (!Number.isFinite(value) || value < 0 || (key.endsWith('Percent') && value > 100))) throw new Error('Summarize Group Discussion metrics must be finite and bounded.');
  return { id: crypto.randomUUID(), itemId: question.id, taskType: 'summarize-group-discussion', ...(question.revision === undefined ? {} : { itemRevision: question.revision }), createdAt: new Date().toISOString(), responseText: transcription.text, durationMs, score: coverage.keyPointCoverage, metrics };
}
