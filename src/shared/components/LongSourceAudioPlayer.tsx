import { useEffect, useRef, useState } from 'react';

type Props = Readonly<{
  audioUrl: string;
  sourceLabel: string;
  primaryLabel: string;
  replayLabel: string;
  instruction: string;
  disabled: boolean;
  onStart: () => void;
  onEnded: () => void;
  onFailure: () => void;
}>;

/** Local long-form stimulus player with one primary play and an explicit practice replay. */
export function LongSourceAudioPlayer({ audioUrl, sourceLabel, primaryLabel, replayLabel, instruction, disabled, onStart, onEnded, onFailure }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [played, setPlayed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const audio = audioRef.current;
    return () => { if (audio) { audio.pause(); audio.currentTime = 0; } };
  }, [audioUrl]);
  async function play(replay: boolean) {
    const audio = audioRef.current;
    if (!audio || disabled) return;
    if (replay) audio.currentTime = 0;
    setError(null);
    try { const playback = audio.play(); onStart(); setPlayed(true); await playback; }
    catch { setPlayed(false); setError(`${sourceLabel} could not be played. Please try again.`); onFailure(); }
  }
  return <section aria-label={sourceLabel}>
    <audio ref={audioRef} src={audioUrl} preload="metadata" onEnded={onEnded} />
    <button type="button" onClick={() => void play(false)} disabled={disabled || played}>{primaryLabel}</button>
    {played && !disabled && <button type="button" onClick={() => void play(true)}>{replayLabel}</button>}
    {error && <p role="alert">{error}</p>}
    <p>{instruction}</p>
  </section>;
}
