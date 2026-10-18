import { useEffect, useRef, useState } from 'react';
import type { AudioAsset } from '../../../domain/content/types';
export function RetellLectureSource({ audio, onStart, onEnded, onFailure, disabled }: { audio: AudioAsset; onStart: () => void; onEnded: () => void; onFailure: () => void; disabled: boolean }) {
  const ref = useRef<HTMLAudioElement>(null); const [played, setPlayed] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { const el = ref.current; return () => { if (el) { el.pause(); el.currentTime = 0; } }; }, [audio.path]);
  async function play(assistance: boolean) {
    const el = ref.current; if (!el || disabled) return;
    if (assistance) el.currentTime = 0;
    setError(null);
    try { const playback = el.play(); onStart(); setPlayed(true); await playback; }
    catch { setPlayed(false); setError('Lecture audio could not be played. Please try again.'); onFailure(); }
  }
  return <section aria-label="Lecture audio">
    <audio ref={ref} src={audio.path} preload="metadata" onEnded={onEnded} />
    <button type="button" onClick={() => void play(false)} disabled={disabled || played}>Play lecture</button>
    {played && !disabled && <button type="button" onClick={() => void play(true)}>Replay lecture (practice assistance)</button>}
    {error && <p role="alert">{error}</p>}
    <p>Listen once and take notes. Recording is unavailable while audio plays.</p>
  </section>;
}
