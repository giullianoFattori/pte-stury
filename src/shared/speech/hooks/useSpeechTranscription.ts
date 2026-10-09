import { useEffect, useRef, useState } from 'react';

import { BROWSER_SPEECH_PROVIDER } from '../../../domain/speech/SpeechToTextAdapter';
import type { SpeechToTextAdapter, SpeechToTextAvailability } from '../../../domain/speech/SpeechToTextAdapter';
import { SpeechToTextError, type TranscriptionResult } from '../../../domain/speech/types';
import { WhisperCppSpeechToTextAdapter } from '../../../infrastructure/speech/WhisperCppSpeechToTextAdapter';

export const DEFAULT_TRANSCRIPTION_LANGUAGE = 'en';
export type TranscriptionStatus =
  | 'idle' | 'checking' | 'needs-install' | 'installing' | 'ready'
  | 'transcribing' | 'success' | 'unavailable' | 'unsupported' | 'downloading' | 'error';

const runtimeAdapter: SpeechToTextAdapter = new WhisperCppSpeechToTextAdapter();

type UseSpeechTranscriptionOptions = {
  language?: string;
  adapter?: SpeechToTextAdapter;
};

export function useSpeechTranscription({
  language: initialLanguage, adapter = runtimeAdapter,
}: UseSpeechTranscriptionOptions = {}) {
  const provider = adapter.provider ?? BROWSER_SPEECH_PROVIDER;
  const [language, setLanguage] = useState(provider.kind === 'local-runtime' ? DEFAULT_TRANSCRIPTION_LANGUAGE : initialLanguage ?? 'en-AU');
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
    setStatus(value === 'available' ? 'ready' : value === 'downloadable' ? 'needs-install' : value);
    setErrorMessage(null);
  }

  function showError(error: unknown) {
    const typed = error instanceof SpeechToTextError ? error : null;
    setErrorMessage(typed?.message ?? 'The recording could not be transcribed locally. Please try again.');
    setStatus(typed?.code === 'unsupported' ? 'unsupported'
      : typed && (['local-unavailable', 'language-unavailable'].includes(typed.code)
        || (provider.kind === 'browser-on-device' && typed.code === 'audio-track-unavailable')) ? 'unavailable' : 'error');
  }

  async function run(operation: (signal: AbortSignal) => Promise<void>) {
    if (!mountedRef.current || busyRef.current) return;
    const generation = generationRef.current;
    busyRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    try { await operation(controller.signal); }
    finally { if (generation === generationRef.current) { busyRef.current = false; abortRef.current = null; } }
  }

  async function checkAvailability() {
    await run(async signal => {
      const generation = generationRef.current;
      setStatus('checking');
      setErrorMessage(null);
      try {
        if (signal.aborted) return;
        const value = await adapter.checkAvailability({ language, signal });
        if (mountedRef.current && generation === generationRef.current) showAvailability(value);
      } catch (error) {
        if (mountedRef.current && generation === generationRef.current) showError(error);
      }
    });
  }

  async function installLanguage() {
    if (!provider.supportsLanguageInstall || availabilityRef.current !== 'downloadable') return;
    await run(async signal => {
      const generation = generationRef.current;
      setStatus('installing');
      setErrorMessage(null);
      try {
        if (!adapter.installLanguage || !await adapter.installLanguage({ language, signal })) {
          throw new SpeechToTextError('recognition-failed', 'The local speech pack could not be installed. Please check availability and try again.');
        }
        if (signal.aborted) return;
        const value = await adapter.checkAvailability({ language, signal });
        if (mountedRef.current && generation === generationRef.current) showAvailability(value);
      } catch (error) {
        if (mountedRef.current && generation === generationRef.current) showError(error);
      }
    });
  }

  async function transcribe(audio: Blob) {
    await run(async signal => {
      const generation = generationRef.current;
      setStatus('transcribing');
      setResult(null);
      setErrorMessage(null);
      try {
        const value = await adapter.transcribe(audio, { language, signal });
        if (mountedRef.current && generation === generationRef.current) {
          setResult(value);
          setStatus('success');
        }
      } catch (error) {
        if (mountedRef.current && generation === generationRef.current) showError(error);
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

  function changeLanguage(nextLanguage: string) {
    if (provider.kind === 'local-runtime' || busyRef.current || nextLanguage === language) return;
    generationRef.current += 1;
    abortRef.current?.abort();
    availabilityRef.current = null;
    setLanguage(nextLanguage);
    setResult(null);
    setErrorMessage(null);
    setStatus('idle');
  }

  return { provider, language, changeLanguage, status, result, errorMessage, checkAvailability, installLanguage, transcribe, resetTranscription };
}
