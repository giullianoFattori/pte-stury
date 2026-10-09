import type { TranscriptionResult } from './types.ts';

export type SpeechToTextAvailability =
  | 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported';

export type SpeechToTextOptions = {
  language: string;
  signal?: AbortSignal;
};

export type SpeechTranscriptionProvider = {
  kind: 'local-runtime' | 'browser-on-device';
  label: string;
  supportsLanguageInstall: boolean;
};

export const BROWSER_SPEECH_PROVIDER: SpeechTranscriptionProvider = {
  kind: 'browser-on-device', label: 'Browser on-device', supportsLanguageInstall: true,
};

export interface SpeechToTextAdapter {
  readonly provider?: SpeechTranscriptionProvider;
  checkAvailability(options: SpeechToTextOptions): Promise<SpeechToTextAvailability>;
  installLanguage?(options: SpeechToTextOptions): Promise<boolean>;
  transcribe(audio: Blob, options: SpeechToTextOptions): Promise<TranscriptionResult>;
}
