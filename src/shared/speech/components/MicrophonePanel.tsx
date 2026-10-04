import { useId } from 'react';

import type { MicrophoneStatus } from '../hooks/useMicrophonePermission';

type MicrophonePanelProps = {
  status: MicrophoneStatus;
  errorMessage: string | null;
  onRequest: () => Promise<void>;
  onDisable: () => void;
  disableBlocked?: boolean;
  description?: string;
};

const statusMessages: Record<MicrophoneStatus, string> = {
  idle: 'Microphone required.',
  requesting: 'Waiting for microphone permission…',
  ready: 'Microphone ready.',
  denied: 'Microphone access denied.',
  unavailable: 'No usable microphone is available.',
  error: 'Microphone access failed.',
};

export function MicrophonePanel({
  status, errorMessage, onRequest, onDisable, disableBlocked = false,
  description = 'Microphone access is required for this speaking exercise.',
}: MicrophonePanelProps) {
  const titleId = useId();
  return (
    <section className="speech-microphone-panel" aria-labelledby={titleId}>
      <h3 id={titleId}>Microphone</h3>
      <p className="speech-microphone-status" role="status">
        {statusMessages[status]}{status === 'idle' && ` ${description}`}
      </p>
      {errorMessage && <p role="alert">{errorMessage}</p>}
      {status === 'denied' && (
        <p>Allow microphone access in your browser site settings, then try again.</p>
      )}
      <div className="speech-actions">
        {status === 'ready' ? (
          <button type="button" onClick={onDisable} disabled={disableBlocked}>Disable microphone</button>
        ) : (
          <button type="button" onClick={() => void onRequest()} disabled={status === 'requesting'}>
            {status === 'requesting' ? 'Requesting…' : status === 'idle' ? 'Enable microphone' : 'Try again'}
          </button>
        )}
      </div>
    </section>
  );
}
