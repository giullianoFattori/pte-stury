export type ReadAloudFluencyConfig = { longPauseMs: number };

export type ReadAloudFluencyMetrics = {
  recordingDurationMs: number;
  responseLatencyMs: number;
  endingSilenceMs: number;
  activeWindowMs: number;
  speechDurationMs: number;
  interiorPauseDurationMs: number;
  speechRatio: number;
  speechRatioPercent: number;
  pauseCount: number;
  longPauseCount: number;
  averagePauseMs: number;
  longestPauseMs: number;
  detectedWordCount?: number;
  speechRateWpm?: number;
  hasSpeech: boolean;
};

export type ReadAloudFluencyFeedbackConfig = {
  severalLongPauses: number;
  lowSpeechRatio: number;
};
