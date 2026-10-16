import { useEffect, useId, useRef } from 'react';
export function EndSessionConfirmation({ ending, error, onKeep, onEnd }: {
  ending: boolean; error?: string; onKeep: () => void; onEnd: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), keep = useRef<HTMLButtonElement>(null);
  const title = useId(), description = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element?.showModal(); keep.current?.focus();
    return () => { element?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={dialog} aria-labelledby={title} aria-describedby={description} aria-busy={ending}
    onCancel={event => { event.preventDefault(); if (!ending) onKeep(); }}>
    <h2 id={title}>End this study session?</h2>
    <div id={description}><p>Your saved answers will stay in your history.</p>
      <p>This session cannot be resumed after you end it. Any unsaved work will be discarded.</p></div>
    {error && <p role="alert">{error}</p>}
    <button type="button" ref={keep} disabled={ending} onClick={onKeep}>Keep studying</button>
    <button type="button" disabled={ending} onClick={onEnd}>{ending ? 'Ending…' : 'End session'}</button>
  </dialog>;
}
