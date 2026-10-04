import { useEffect, useRef, useState } from 'react';

export type RecordingStatus = 'idle' | 'recording' | 'recorded' | 'error';

export type AudioRecording = {
  blob: Blob;
  url: string;
  mimeType: string;
  durationMs: number;
};

function getSupportedMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return typeof MediaRecorder.isTypeSupported === 'function'
    ? candidates.find((type) => MediaRecorder.isTypeSupported(type))
    : undefined;
}

export function useAudioRecorder() {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [recording, setRecording] = useState<AudioRecording | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const stoppingRef = useRef(false);
  const isMountedRef = useRef(false);

  function revokeRecordingUrl() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }

  function releaseRecorder() {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder) {
      // Discard queued finalization events when resetting or leaving this page.
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch (unknownError) {
          console.error('Unable to stop audio recorder:', unknownError);
        }
      }
    }
    chunksRef.current = [];
    startedAtRef.current = null;
    stoppingRef.current = false;
  }

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      releaseRecorder();
      revokeRecordingUrl();
    };
  }, []);

  function failRecording(message: string, unknownError?: unknown) {
    if (unknownError) console.error('Unable to record audio response:', unknownError);
    releaseRecorder();
    revokeRecordingUrl();
    if (isMountedRef.current) {
      setRecording(null);
      setIsFinalizing(false);
      setErrorMessage(message);
      setStatus('error');
    }
  }

  function startRecording(stream: MediaStream) {
    if (!isMountedRef.current || recorderRef.current) return;
    if (typeof MediaRecorder === 'undefined') {
      failRecording('Audio recording is not supported in this browser.');
      return;
    }
    if (!stream.getAudioTracks().some((track) => track.readyState === 'live')) {
      failRecording('The microphone is no longer available.');
      return;
    }

    revokeRecordingUrl();
    setRecording(null);
    setErrorMessage(null);
    setIsFinalizing(false);

    try {
      const mimeType = getSupportedMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (recorderRef.current === recorder && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onerror = (event) => {
        if (recorderRef.current === recorder) {
          failRecording('Recording failed. Please try again.', event);
        }
      };
      recorder.onstop = () => {
        if (!isMountedRef.current || recorderRef.current !== recorder) return;
        if (!stream.getAudioTracks().some((track) => track.readyState === 'live')) {
          failRecording('The microphone is no longer available.');
          return;
        }
        try {
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || chunksRef.current[0]?.type,
          });
          if (blob.size === 0) {
            failRecording('No audio was captured. Please try again.');
            return;
          }
          const durationMs = Math.max(0, Math.round(performance.now() - (startedAtRef.current ?? performance.now())));
          const url = URL.createObjectURL(blob);
          objectUrlRef.current = url;
          releaseRecorder();
          setRecording({ blob, url, mimeType: blob.type, durationMs });
          setIsFinalizing(false);
          setStatus('recorded');
        } catch (unknownError) {
          failRecording('Recording could not be prepared for playback. Please try again.', unknownError);
        }
      };
      startedAtRef.current = performance.now();
      recorder.start();
      setStatus('recording');
    } catch (unknownError) {
      failRecording('Recording could not be started. Please try again.', unknownError);
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive' || stoppingRef.current) return;
    stoppingRef.current = true;
    setIsFinalizing(true);
    try {
      recorder.stop();
      // Status stays recording until the final dataavailable + stop events complete.
    } catch (unknownError) {
      failRecording('Recording could not be stopped. Please try again.', unknownError);
    }
  }

  function resetRecording() {
    releaseRecorder();
    revokeRecordingUrl();
    setRecording(null);
    setErrorMessage(null);
    setIsFinalizing(false);
    setStatus('idle');
  }

  return { status, recording, errorMessage, isFinalizing, startRecording, stopRecording, resetRecording };
}
