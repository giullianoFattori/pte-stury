import type { ReadAloudFluencyFeedbackConfig, ReadAloudFluencyMetrics } from './fluencyTypes';

export const DEFAULT_READ_ALOUD_FLUENCY_FEEDBACK_CONFIG = {
  severalLongPauses: 2, lowSpeechRatio: 0.70,
} satisfies ReadAloudFluencyFeedbackConfig;

export function buildReadAloudFluencyFeedback(
  metrics: ReadAloudFluencyMetrics, config: Partial<ReadAloudFluencyFeedbackConfig> = {},
): string[] {
  const settings = { ...DEFAULT_READ_ALOUD_FLUENCY_FEEDBACK_CONFIG, ...config };
  if (!Number.isInteger(settings.severalLongPauses) || settings.severalLongPauses < 1
    || !Number.isFinite(settings.lowSpeechRatio) || settings.lowSpeechRatio < 0 || settings.lowSpeechRatio > 1) {
    throw new RangeError('Invalid timing feedback configuration.');
  }
  if (!metrics.hasSpeech) return ['No continuous speech was detected.'];
  const messages: string[] = [];
  if (metrics.longPauseCount >= settings.severalLongPauses) {
    messages.push('Several longer pauses were detected. Turn on phrasing help and try reading in phrase groups rather than word by word.');
  } else if (metrics.longPauseCount > 0) {
    messages.push(metrics.longPauseCount === 1 ? 'One longer pause was detected inside the reading.'
      : `${metrics.longPauseCount} longer pauses were detected inside the reading.`);
  }
  if (metrics.speechRatio < settings.lowSpeechRatio) {
    messages.push('A large part of the reading window was silent. Focus on smoother phrase-to-phrase transitions.');
  }
  if (!messages.length) messages.push('Your reading was relatively continuous. Keep prioritising clarity over speed.');
  return messages;
}
