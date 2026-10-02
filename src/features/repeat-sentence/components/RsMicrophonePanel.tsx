import type { MicrophoneStatus } from '../hooks/useMicrophonePermission';

type RsMicrophonePanelProps = {
  status: MicrophoneStatus;
  errorMessage: string | null;
  onRequest: () => Promise<void>;
  onDisable: () => void;
  disableBlocked?: boolean;
};

const statusMessages: Record<MicrophoneStatus, string> = {
  idle: 'Microphone required. Repeat Sentence needs microphone access.',
  requesting: 'Waiting for microphone permission…',
  ready: 'Microphone ready.',
  denied: 'Microphone access denied.',
  unavailable: 'No usable microphone is available.',
  error: 'Microphone access failed.',
};

export function RsMicrophonePanel({ status, errorMessage, onRequest, onDisable, disableBlocked = false }: RsMicrophonePanelProps) {
  return (
    <section className="rs-microphone-panel" aria-labelledby="rs-microphone-title">
      <h3 id="rs-microphone-title">Microphone</h3>
      <p className="rs-microphone-status" role="status">{statusMessages[status]}</p>
      {errorMessage && <p role="alert">{errorMessage}</p>}
      {status === 'denied' && (
        <p>Allow microphone access in your browser site settings, then try again.</p>
      )}
      <div className="rs-actions">
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
