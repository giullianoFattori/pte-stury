import type { TranscriptionResult } from './types';

export type SpeechToTextAvailability =
  | 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported';

export type SpeechToTextOptions = {
  language: string;
  signal?: AbortSignal;
};

export interface SpeechToTextAdapter {
  checkAvailability(options: SpeechToTextOptions): Promise<SpeechToTextAvailability>;
  installLanguage?(options: SpeechToTextOptions): Promise<boolean>;
  transcribe(audio: Blob, options: SpeechToTextOptions): Promise<TranscriptionResult>;
}
