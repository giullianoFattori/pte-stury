import { SpeechToTextError } from '../../domain/speech/types.ts';

// Deliberately not a production SpeechToTextAdapter: Activity 05 will expand its engine union.
export type WhisperCppPocResult = {
  text: string;
  language: 'en';
  engine: 'whisper.cpp';
  processedLocally: true;
  audioSeconds: number;
  inferenceSeconds: number;
  totalSeconds: number;
  realTimeFactor: number;
};

export class WhisperCppPocSpeechToTextAdapter {
  async transcribe(audio: Blob, options: { signal?: AbortSignal } = {}): Promise<WhisperCppPocResult> {
    if (!import.meta.env.DEV) throw new SpeechToTextError('unsupported', 'Whisper POC is development only.');
    if (!audio.size || audio.size > 12 * 1024 * 1024) throw new SpeechToTextError('recognition-failed', 'Recording must be between 1 byte and 12 MiB.');
    const response = await fetch('/__local-stt/transcribe', { method: 'POST', body: audio,
      signal: options.signal, headers: { 'Content-Type': audio.type || 'audio/webm' } });
    if (!response.ok) throw new SpeechToTextError('recognition-failed', `Local transcription failed (${response.status}).`);
    const data = await response.json();
    if (typeof data.text !== 'string' || data.language !== 'en' || data.engine !== 'whisper.cpp'
      || data.processedLocally !== true || ![data.audioSeconds, data.inferenceSeconds, data.totalSeconds, data.realTimeFactor]
        .every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) {
      throw new SpeechToTextError('recognition-failed', 'Invalid local transcription response.');
    }
    if (!data.text.trim()) throw new SpeechToTextError('no-speech', 'No speech detected.');
    return { text: data.text, language: 'en', engine: 'whisper.cpp', processedLocally: true,
      audioSeconds: data.audioSeconds, inferenceSeconds: data.inferenceSeconds,
      totalSeconds: data.totalSeconds, realTimeFactor: data.realTimeFactor };
  }
}
