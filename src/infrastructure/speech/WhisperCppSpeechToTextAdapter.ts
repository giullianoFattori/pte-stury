import type {
  SpeechToTextAdapter, SpeechToTextOptions, SpeechTranscriptionProvider,
} from '../../domain/speech/SpeechToTextAdapter.ts';
import { SpeechToTextError } from '../../domain/speech/types.ts';
import { getSpeechRuntimeHealth, transcribeWithSpeechRuntime } from './speechRuntimeClient.ts';

export const WHISPER_PROVIDER: SpeechTranscriptionProvider = {
  kind: 'local-runtime', label: 'Local Whisper', supportsLanguageInstall: false,
};

export class WhisperCppSpeechToTextAdapter implements SpeechToTextAdapter {
  readonly provider = WHISPER_PROVIDER;

  async checkAvailability({ signal }: SpeechToTextOptions) {
    try {
      const health = await getSpeechRuntimeHealth(signal);
      return health.status === 'ready' ? 'available' : 'unavailable';
    } catch (error) {
      if (error instanceof SpeechToTextError && error.code === 'cancelled') throw error;
      return error instanceof SpeechToTextError && error.code === 'unsupported' ? 'unsupported' : 'unavailable';
    }
  }

  transcribe(audio: Blob, { signal }: SpeechToTextOptions) {
    return transcribeWithSpeechRuntime(audio, signal);
  }
}
