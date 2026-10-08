export type TranscriptionWord = {
  text: string;
  confidence?: number;
  startMs?: number;
  endMs?: number;
};

export type SpeechToTextEngine = 'browser-on-device' | 'whisper.cpp';

export type TranscriptionResult = {
  text: string;
  confidence?: number;
  words?: TranscriptionWord[];
  engine: SpeechToTextEngine;
  model?: string;
  language: string;
  processedLocally: true;
  // Runtime evidence only; integer milliseconds, never a learner score.
  audioMs?: number;
  inferenceMs?: number;
  totalMs?: number;
};

export type SpeechToTextErrorCode =
  | 'unsupported' | 'local-unavailable' | 'language-unavailable'
  | 'audio-track-unavailable' | 'no-speech' | 'recognition-failed' | 'cancelled';

export class SpeechToTextError extends Error {
  readonly code: SpeechToTextErrorCode;

  constructor(code: SpeechToTextErrorCode, message: string) {
    super(message);
    this.name = 'SpeechToTextError';
    this.code = code;
  }
}
