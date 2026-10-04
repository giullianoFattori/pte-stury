import { useEffect, useRef, useState } from 'react';

import type { SpeechToTextAdapter, SpeechToTextAvailability } from '../../../domain/speech/SpeechToTextAdapter';
import { SpeechToTextError, type TranscriptionResult } from '../../../domain/speech/types';
import { BrowserOnDeviceSpeechToTextAdapter } from '../../../infrastructure/speech/BrowserOnDeviceSpeechToTextAdapter';

export const DEFAULT_TRANSCRIPTION_LANGUAGE = 'en-AU';
export type TranscriptionStatus =
  | 'idle' | 'checking' | 'needs-install' | 'installing' | 'ready'
  | 'transcribing' | 'success' | 'unavailable' | 'error';

const browserAdapter: SpeechToTextAdapter = new BrowserOnDeviceSpeechToTextAdapter();

type UseSpeechTranscriptionOptions = {
  language?: string;
  adapter?: SpeechToTextAdapter;
};

export function useSpeechTranscription({
  language = DEFAULT_TRANSCRIPTION_LANGUAGE, adapter = browserAdapter,
}: UseSpeechTranscriptionOptions = {}) {
  const [status, setStatus] = useState<TranscriptionStatus>('idle');
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(false);
  const busyRef = useRef(false);
  const availabilityRef = useRef<SpeechToTextAvailability | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      abortRef.current?.abort();
      busyRef.current = false;
    };
  }, []);

  function showAvailability(value: SpeechToTextAvailability) {
    availabilityRef.current = value;
    setStatus(value === 'available' ? 'ready' : value === 'downloadable' ? 'needs-install' : value === 'downloading' ? 'checking' : 'unavailable');
    setErrorMessage(value === 'downloading' ? 'The local speech pack is downloading. Check again when it finishes.' : null);
  }

  function showError(error: unknown) {
    const typed = error instanceof SpeechToTextError ? error : null;
    setErrorMessage(typed?.message ?? 'The recording could not be transcribed locally. Please try again.');
    setStatus(typed && ['unsupported', 'local-unavailable', 'language-unavailable', 'audio-track-unavailable'].includes(typed.code) ? 'unavailable' : 'error');
  }

  async function run(operation: () => Promise<void>) {
    if (!mountedRef.current || busyRef.current) return;
    const generation = generationRef.current;
    busyRef.current = true;
    try { await operation(); }
    finally { if (generation === generationRef.current) busyRef.current = false; }
  }

  async function checkAvailability() {
    await run(async () => {
      const generation = generationRef.current;
      setStatus('checking');
      setErrorMessage(null);
      try {
        const value = await adapter.checkAvailability({ language });
        if (mountedRef.current && generation === generationRef.current) showAvailability(value);
      } catch (error) {
        if (mountedRef.current && generation === generationRef.current) showError(error);
      }
    });
  }

  async function installLanguage() {
    if (availabilityRef.current !== 'downloadable') return;
    await run(async () => {
      const generation = generationRef.current;
      setStatus('installing');
      setErrorMessage(null);
      try {
        if (!adapter.installLanguage || !await adapter.installLanguage({ language })) {
          throw new SpeechToTextError('recognition-failed', 'The local speech pack could not be installed. Please check availability and try again.');
        }
        const value = await adapter.checkAvailability({ language });
        if (mountedRef.current && generation === generationRef.current) showAvailability(value);
      } catch (error) {
        if (mountedRef.current && generation === generationRef.current) showError(error);
      }
    });
  }

  async function transcribe(audio: Blob) {
    await run(async () => {
      const generation = generationRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus('transcribing');
      setResult(null);
      setErrorMessage(null);
      try {
        const value = await adapter.transcribe(audio, { language, signal: controller.signal });
        if (mountedRef.current && generation === generationRef.current) {
          setResult(value);
          setStatus('success');
        }
      } catch (error) {
        if (mountedRef.current && generation === generationRef.current) showError(error);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    });
  }

  function resetTranscription() {
    generationRef.current += 1;
    busyRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    setResult(null);
    setErrorMessage(null);
    const value = availabilityRef.current;
    if (value) showAvailability(value);
    else setStatus('idle');
  }

  return { status, result, errorMessage, checkAvailability, installLanguage, transcribe, resetTranscription };
}
