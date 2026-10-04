import { useId } from 'react';

import type { TranscriptionResult } from '../../../domain/speech/types';
import type { TranscriptionStatus } from '../hooks/useSpeechTranscription';

type TranscriptionPanelProps = {
  status: TranscriptionStatus;
  result: TranscriptionResult | null;
  errorMessage: string | null;
  hasRecording: boolean;
  disabled: boolean;
  languageLabel?: string;
  onCheck: () => Promise<void>;
  onInstall: () => Promise<void>;
  onTranscribe: () => Promise<void>;
};

export function TranscriptionPanel({
  status, result, errorMessage, hasRecording, disabled, onCheck, onInstall, onTranscribe,
  languageLabel = 'English (Australia)',
}: TranscriptionPanelProps) {
  const titleId = useId();
  const busy = status === 'installing' || status === 'transcribing' || (status === 'checking' && !errorMessage);
  return (
    <section className="speech-transcription-panel" aria-labelledby={titleId} aria-busy={busy}>
      <h3 id={titleId}>Local transcription</h3>
      <p>{languageLabel}. Audio stays on this device. No cloud fallback.</p>
      {status === 'idle' && <p>Check whether this browser supports on-device transcription.</p>}
      {status === 'checking' && <p role="status">Checking local speech recognition…</p>}
      {status === 'installing' && <p role="status">Installing local speech pack… This downloads a language pack, not your audio.</p>}
      {status === 'needs-install' && <p>A local English speech pack is required.</p>}
      {status === 'ready' && <p role="status">Local transcription ready.</p>}
      {status === 'transcribing' && <p role="status">Transcribing locally…</p>}
      {status === 'unavailable' && <p>Local recorded-audio transcription is unavailable on this browser/device. Recording and playback still work.</p>}
      {errorMessage && <p role="alert">{errorMessage}</p>}
      {status === 'success' && result && (
        <>
          <h4>Detected speech</h4>
          <p role="status">{result.text}</p>
          <p>Processed on this device.</p>
        </>
      )}
      <div className="speech-actions">
        {status === 'needs-install' ? (
          <button type="button" onClick={() => void onInstall()} disabled={disabled || busy}>Install local speech pack</button>
        ) : ['ready', 'success', 'error'].includes(status) && hasRecording ? (
          <button type="button" onClick={() => void onTranscribe()} disabled={disabled || busy}>
            {status === 'error' ? 'Try transcription again' : 'Transcribe locally'}
          </button>
        ) : !busy && (
          <button type="button" onClick={() => void onCheck()} disabled={disabled}>Check local availability</button>
        )}
      </div>
    </section>
  );
}
