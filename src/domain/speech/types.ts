export type TranscriptionWord = {
  text: string;
  confidence?: number;
  startMs?: number;
  endMs?: number;
};

export type TranscriptionResult = {
  text: string;
  confidence?: number;
  words?: TranscriptionWord[];
  engine: 'browser-on-device';
  language: string;
  processedLocally: true;
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
