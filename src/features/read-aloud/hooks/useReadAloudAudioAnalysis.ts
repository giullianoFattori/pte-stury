import { useEffect, useRef, useState } from 'react';

import { AudioAnalysisError, segmentSpeech, type SpeechSegmentationResult } from '../../../domain/audio-analysis';
import { decodeAudioBlob } from '../../../infrastructure/audio/decodeAudioBlob';

export type AudioAnalysisStatus = 'idle' | 'analysing' | 'success' | 'error';

export function useReadAloudAudioAnalysis() {
  const [status, setStatus] = useState<AudioAnalysisStatus>('idle');
  const [result, setResult] = useState<SpeechSegmentationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const busyRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; generationRef.current += 1; busyRef.current = false; };
  }, []);

  async function analyse(blob: Blob) {
    if (!mountedRef.current || busyRef.current) return;
    const generation = generationRef.current;
    busyRef.current = true;
    setStatus('analysing');
    setResult(null);
    setErrorMessage(null);
    try {
      const decoded = await decodeAudioBlob(blob);
      if (!mountedRef.current || generation !== generationRef.current) return;
      const analysis = segmentSpeech(decoded.samples, decoded.sampleRate);
      setResult(analysis);
      setStatus('success');
    } catch (error) {
      if (mountedRef.current && generation === generationRef.current) {
        setErrorMessage(error instanceof AudioAnalysisError ? error.message : 'This recording could not be analysed. Please try again.');
        setStatus('error');
      }
    } finally {
      if (generation === generationRef.current) busyRef.current = false;
    }
  }

  function resetAnalysis() {
    generationRef.current += 1;
    busyRef.current = false;
    setResult(null);
    setErrorMessage(null);
    setStatus('idle');
  }
  return { status, result, errorMessage, analyse, resetAnalysis };
}
