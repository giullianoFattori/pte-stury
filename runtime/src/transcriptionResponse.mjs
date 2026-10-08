import { AudioRequestError } from './errors.mjs';

export function buildTranscriptionResponse({ text, modelId, audioMs, inferenceMs, totalMs }) {
  if (typeof text !== 'string' || !text.trim() || (modelId !== 'base.en' && modelId !== 'small.en')
    || ![audioMs, inferenceMs, totalMs].every(value => Number.isSafeInteger(value) && value >= 0)
    || totalMs < inferenceMs) {
    throw new AudioRequestError(500, 'INTERNAL_ERROR', 'The transcription result is invalid.');
  }
  return { text: text.trim(), language: 'en', engine: 'whisper.cpp', model: modelId, processedLocally: true,
    timing: { audioMs, inferenceMs, totalMs } };
}
