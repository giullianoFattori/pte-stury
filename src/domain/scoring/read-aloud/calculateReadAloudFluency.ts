import type { SpeechSegmentationResult } from '../../audio-analysis/types';
import type { ReadAloudFluencyConfig, ReadAloudFluencyMetrics } from './fluencyTypes';

export const DEFAULT_READ_ALOUD_FLUENCY_CONFIG = { longPauseMs: 500 } satisfies ReadAloudFluencyConfig;
const BOUNDARY_EPSILON_MS = 1e-6;

export function calculateReadAloudFluency(
  segmentation: SpeechSegmentationResult,
  detectedWordCount?: number,
  config: Partial<ReadAloudFluencyConfig> = {},
): ReadAloudFluencyMetrics {
  const { longPauseMs } = { ...DEFAULT_READ_ALOUD_FLUENCY_CONFIG, ...config };
  const recordingDurationMs = segmentation.durationMs;
  if (!Number.isFinite(longPauseMs) || longPauseMs < 0
    || !Number.isFinite(recordingDurationMs) || recordingDurationMs < 0
    || (detectedWordCount !== undefined && (!Number.isSafeInteger(detectedWordCount) || detectedWordCount < 0))) {
    throw new RangeError('Invalid fluency metric input.');
  }
  for (const segment of [...segmentation.speechSegments, ...segmentation.pauseSegments]) {
    if (![segment.startMs, segment.endMs, segment.durationMs].every(Number.isFinite)
      || segment.startMs < 0 || segment.endMs < segment.startMs || segment.durationMs < 0
      || segment.endMs > recordingDurationMs + BOUNDARY_EPSILON_MS) {
      throw new RangeError('Invalid segmentation timing.');
    }
  }
  const speech = segmentation.speechSegments.filter(segment => segment.durationMs > 0 && segment.endMs > segment.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  const base: ReadAloudFluencyMetrics = {
    recordingDurationMs, responseLatencyMs: 0, endingSilenceMs: 0, activeWindowMs: 0,
    speechDurationMs: 0, interiorPauseDurationMs: 0, speechRatio: 0, speechRatioPercent: 0,
    pauseCount: 0, longPauseCount: 0, averagePauseMs: 0, longestPauseMs: 0, hasSpeech: false,
    ...(detectedWordCount === undefined ? {} : { detectedWordCount }),
  };
  if (!speech.length) return base;
  const startMs = speech[0].startMs;
  const endMs = Math.min(recordingDurationMs, speech.reduce((end, segment) => Math.max(end, segment.endMs), 0));
  const activeWindowMs = Math.max(0, endMs - startMs);
  if (!activeWindowMs) return base;
  const pauses = segmentation.pauseSegments.filter(pause => pause.durationMs > 0
    && pause.startMs >= startMs - BOUNDARY_EPSILON_MS && pause.endMs <= endMs + BOUNDARY_EPSILON_MS);
  const speechDurationMs = speech.reduce((total, segment) => total + segment.durationMs, 0);
  const interiorPauseDurationMs = pauses.reduce((total, pause) => total + pause.durationMs, 0);
  const speechRatio = Math.max(0, Math.min(1, speechDurationMs / activeWindowMs));
  const result: ReadAloudFluencyMetrics = {
    ...base, hasSpeech: true, responseLatencyMs: startMs,
    endingSilenceMs: Math.max(0, recordingDurationMs - endMs), activeWindowMs,
    speechDurationMs, interiorPauseDurationMs, speechRatio,
    speechRatioPercent: Number((speechRatio * 100).toFixed(2)),
    pauseCount: pauses.length,
    longPauseCount: pauses.filter(pause => pause.durationMs >= longPauseMs).length,
    averagePauseMs: pauses.length ? interiorPauseDurationMs / pauses.length : 0,
    longestPauseMs: pauses.reduce((longest, pause) => Math.max(longest, pause.durationMs), 0),
    ...(detectedWordCount === undefined ? {} : { speechRateWpm: detectedWordCount / (activeWindowMs / 60_000) }),
  };
  if (Object.values(result).some(value => typeof value === 'number' && !Number.isFinite(value))) {
    throw new RangeError('Fluency metrics exceeded finite numeric limits.');
  }
  return result;
}
