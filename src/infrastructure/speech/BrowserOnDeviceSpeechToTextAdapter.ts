import { BROWSER_SPEECH_PROVIDER } from '../../domain/speech/SpeechToTextAdapter.ts';
import type { SpeechToTextAdapter, SpeechToTextAvailability, SpeechToTextOptions } from '../../domain/speech/SpeechToTextAdapter';
import { SpeechToTextError, type TranscriptionResult } from '../../domain/speech/types.ts';
import type { BrowserSpeechRecognitionConstructor, CapturableAudio, SpeechWindow } from './browserSpeechRecognitionTypes';

function getConstructor(): BrowserSpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return;
  const host = window as SpeechWindow;
  const Constructor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
  if (!Constructor?.available || !Constructor.install) return;
  try {
    if (!('processLocally' in new Constructor())) return;
    if (typeof (document.createElement('audio') as CapturableAudio).captureStream !== 'function') return;
    return Constructor;
  } catch { return; }
}

function localOptions(language: string) {
  return { langs: [language], processLocally: true as const };
}

function browserError(code: string): SpeechToTextError {
  switch (code) {
    case 'no-speech': return new SpeechToTextError('no-speech', 'No speech was recognized. Try a clearer recording.');
    case 'language-not-supported': return new SpeechToTextError('language-unavailable', 'The local speech pack for this language is unavailable.');
    case 'audio-capture': return new SpeechToTextError('audio-track-unavailable', 'This browser could not transcribe the recorded audio track.');
    case 'not-allowed':
    case 'service-not-allowed': return new SpeechToTextError('local-unavailable', 'Local speech recognition is blocked on this browser/device.');
    default: return new SpeechToTextError('recognition-failed', 'The recording could not be transcribed locally. Please try again.');
  }
}

export class BrowserOnDeviceSpeechToTextAdapter implements SpeechToTextAdapter {
  readonly provider = BROWSER_SPEECH_PROVIDER;
  async checkAvailability({ language }: SpeechToTextOptions): Promise<SpeechToTextAvailability> {
    const Constructor = getConstructor();
    if (!Constructor) return 'unsupported';
    try {
      const state = await Constructor.available!(localOptions(language));
      return ['available', 'downloadable', 'downloading', 'unavailable'].includes(state) ? state : 'unavailable';
    } catch {
      throw new SpeechToTextError('local-unavailable', 'Local speech recognition could not be checked. Browser policy may block it.');
    }
  }

  async installLanguage({ language }: SpeechToTextOptions): Promise<boolean> {
    const Constructor = getConstructor();
    if (!Constructor) throw new SpeechToTextError('unsupported', 'Local transcription is not supported on this browser/device.');
    try { return await Constructor.install!(localOptions(language)); }
    catch { throw new SpeechToTextError('language-unavailable', 'The local speech pack could not be installed. Please try again.'); }
  }

  async transcribe(blob: Blob, { language, signal }: SpeechToTextOptions): Promise<TranscriptionResult> {
    if (signal?.aborted) throw new SpeechToTextError('cancelled', 'Transcription cancelled.');
    const Constructor = getConstructor();
    if (!Constructor) throw new SpeechToTextError('unsupported', 'Local recorded-audio transcription is not supported on this browser/device.');
    if (await this.checkAvailability({ language }) !== 'available') {
      throw new SpeechToTextError('language-unavailable', 'Install an available local speech pack before transcribing.');
    }
    if (!blob.size) throw new SpeechToTextError('no-speech', 'No audio was captured. Please record again.');
    if (signal?.aborted) throw new SpeechToTextError('cancelled', 'Transcription cancelled.');

    const audio = document.createElement('audio') as CapturableAudio;
    const recognition = new Constructor();
    const url = URL.createObjectURL(blob);
    let stream: MediaStream | undefined;
    let started = false;
    let cleanupSession = () => {};
    try {
      recognition.processLocally = true;
      if (recognition.processLocally !== true) throw new SpeechToTextError('unsupported', 'This browser cannot guarantee local processing.');
      recognition.lang = language;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      audio.preload = 'auto';
      // Silence the speakers, not the captured track (captureStream ignores volume).
      audio.volume = 0;
      return await new Promise<TranscriptionResult>((resolve, reject) => {
        let text = '';
        let confidence: number | undefined;
        let settled = false;
        const finish = (error?: SpeechToTextError) => {
          if (settled) return;
          settled = true;
          if (error) reject(error);
          else if (!text.trim()) reject(browserError('no-speech'));
          else resolve({ text: text.trim(), confidence, engine: 'browser-on-device', language, processedLocally: true });
        };
        const cancel = () => finish(new SpeechToTextError('cancelled', 'Transcription cancelled.'));
        const timeout = setTimeout(() => finish(new SpeechToTextError('recognition-failed', 'Local transcription timed out. Please try again.')), 60_000);
        cleanupSession = () => { clearTimeout(timeout); signal?.removeEventListener('abort', cancel); };
        signal?.addEventListener('abort', cancel, { once: true });
        recognition.onresult = (event) => {
          const finals = Array.from(event.results).filter((result) => result.isFinal);
          text = finals.map((result) => result[0].transcript.trim()).filter(Boolean).join(' ');
          const value = finals[0]?.[0].confidence;
          confidence = typeof value === 'number' && Number.isFinite(value) ? value : undefined;
        };
        recognition.onerror = (event) => finish(browserError(event.error));
        recognition.onend = () => finish();
        recognition.onstart = () => {
          if (!settled) void audio.play().catch(() => finish(browserError('audio-capture')));
        };
        audio.onerror = () => finish(new SpeechToTextError('audio-track-unavailable', 'The recorded audio could not be decoded.'));
        audio.onended = () => { try { recognition.stop(); } catch { finish(browserError('audio-capture')); } };
        audio.oncanplay = () => {
          if (started || settled) return;
          started = true;
          try {
            stream = audio.captureStream!();
            const track = stream.getAudioTracks().find((candidate) => candidate.kind === 'audio' && candidate.readyState === 'live');
            if (!track) { finish(browserError('audio-capture')); return; }
            // Never call start() without the exact recording's track, or retry with a microphone.
            recognition.start(track);
          } catch { finish(browserError('audio-capture')); }
        };
        audio.src = url;
        audio.load();
        if (signal?.aborted) cancel();
      });
    } finally {
      cleanupSession();
      recognition.onresult = null;
      recognition.onstart = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.abort(); } catch { /* Already ended or never started. */ }
      audio.oncanplay = null;
      audio.onerror = null;
      audio.onended = null;
      audio.pause();
      stream?.getTracks().forEach((track) => track.stop());
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
    }
  }
}
