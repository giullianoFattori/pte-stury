import { useEffect, useRef, useState } from 'react';

export type MicrophoneStatus = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable' | 'error';

export function useMicrophonePermission() {
  const [status, setStatus] = useState<MicrophoneStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const isRequestingRef = useRef(false);
  const removeListenersRef = useRef<(() => void) | null>(null);

  function releaseStream() {
    const stream = streamRef.current;
    streamRef.current = null;
    removeListenersRef.current?.();
    removeListenersRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
  }

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      requestIdRef.current += 1;
      isRequestingRef.current = false;
      releaseStream();
    };
  }, []);

  async function requestMicrophone() {
    if (!isMountedRef.current || isRequestingRef.current) {
      return;
    }
    if (streamRef.current?.getAudioTracks().some((track) => track.readyState === 'live')) {
      return;
    }

    releaseStream();
    setErrorMessage(null);

    if (!window.isSecureContext) {
      setStatus('unavailable');
      setErrorMessage('Microphone access requires HTTPS or localhost.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable');
      setErrorMessage('Microphone access is not supported in this browser.');
      return;
    }

    const requestId = ++requestIdRef.current;
    isRequestingRef.current = true;
    setStatus('requesting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Permission can resolve after navigation or cancellation; release that late stream.
      if (!isMountedRef.current || requestId !== requestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const audioTracks = stream.getAudioTracks();
      if (!audioTracks.some((track) => track.readyState === 'live')) {
        stream.getTracks().forEach((track) => track.stop());
        setStatus('unavailable');
        setErrorMessage('No usable microphone is available.');
        return;
      }

      streamRef.current = stream;
      const handleEnded = () => {
        if (streamRef.current !== stream) {
          return;
        }
        releaseStream();
        setStatus('unavailable');
        setErrorMessage('The microphone is no longer available.');
      };
      audioTracks.forEach((track) => track.addEventListener('ended', handleEnded));
      removeListenersRef.current = () => {
        audioTracks.forEach((track) => track.removeEventListener('ended', handleEnded));
      };
      setStatus('ready');
    } catch (unknownError) {
      if (!isMountedRef.current || requestId !== requestIdRef.current) {
        return;
      }
      const name = unknownError instanceof Error ? unknownError.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setStatus('denied');
        setErrorMessage('Microphone permission was denied.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setStatus('unavailable');
        setErrorMessage('No microphone was found.');
      } else {
        console.error('Unable to access microphone:', unknownError);
        setStatus('error');
        setErrorMessage(name === 'NotReadableError' || name === 'TrackStartError'
          ? 'The microphone could not be started. Check whether another app is using it, then try again.'
          : 'Unable to access the microphone. Please try again.');
      }
    } finally {
      if (requestId === requestIdRef.current) {
        isRequestingRef.current = false;
      }
    }
  }

  function stopMicrophone() {
    requestIdRef.current += 1;
    isRequestingRef.current = false;
    releaseStream();
    setStatus('idle');
    setErrorMessage(null);
  }

  return { status, errorMessage, streamRef, requestMicrophone, stopMicrophone };
}
