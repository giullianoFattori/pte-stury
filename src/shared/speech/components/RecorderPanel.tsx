import { useEffect, useId, useRef } from 'react';

import type { AudioRecording, RecordingStatus } from '../hooks/useAudioRecorder';

type RecorderPanelProps = {
  status: RecordingStatus;
  recording: AudioRecording | null;
  errorMessage: string | null;
  canStart: boolean;
  isFinalizing: boolean;
  disabled?: boolean;
  instruction?: string;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
};

export function RecorderPanel({
  status, recording, errorMessage, canStart, isFinalizing, disabled = false, onStart, onStop, onReset,
  instruction = 'Enable the microphone before recording.',
}: RecorderPanelProps) {
  const titleId = useId();
  const playbackRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const audio = playbackRef.current;
    return () => { audio?.pause(); };
  }, [recording?.url]);

  return (
    <section className="speech-recorder-panel" aria-labelledby={titleId}>
      <h3 id={titleId}>Your response</h3>
      {errorMessage && <p role="alert">{errorMessage}</p>}
      {status === 'recording' ? (
        <>
          <p role="status">{isFinalizing ? 'Preparing your recording…' : 'Recording…'}</p>
          <button type="button" onClick={onStop} disabled={isFinalizing}>
            {isFinalizing ? 'Finishing…' : 'Stop recording'}
          </button>
        </>
      ) : status === 'recorded' && recording ? (
        <>
          <p role="status">Your recording is ready.</p>
          <audio ref={playbackRef} controls preload="metadata" src={recording.url} aria-label="Your recording" />
          <p>Duration: {(recording.durationMs / 1000).toFixed(1)} s</p>
          <button type="button" onClick={onReset} disabled={disabled}>Record again</button>
        </>
      ) : (
        <>
          <p>{instruction}</p>
          <button type="button" onClick={onStart} disabled={!canStart}>
            {status === 'error' ? 'Try recording again' : 'Start recording'}
          </button>
        </>
      )}
    </section>
  );
}
