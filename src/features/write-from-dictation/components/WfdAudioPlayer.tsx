import { useEffect, useRef, useState } from 'react';

type WfdAudioPlayerProps = {
  audioUrl: string;
};

export function WfdAudioPlayer({ audioUrl }: WfdAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;

    return () => {
      audio?.pause();
    };
  }, []);

  async function handlePlay() {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    setError(null);
    setIsPlaying(true);

    try {
      audio.currentTime = 0;
      await audio.play();
      setHasPlayed(true);
    } catch (unknownError) {
      // Changing questions or leaving the screen intentionally interrupts playback.
      if (!audio.isConnected) {
        return;
      }

      console.error('Unable to play WFD audio:', unknownError);
      setIsPlaying(false);
      setError('Unable to play this audio. Please try again.');
    }
  }

  return (
    <div className="wfd-audio-player">
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="auto"
        onPlay={() => setIsPlaying(true)}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onError={() => {
          console.error('Unable to load WFD audio:', audioRef.current?.error);
          setIsPlaying(false);
          setError('Unable to play this audio. Please try again.');
        }}
      />
      <button type="button" onClick={() => void handlePlay()} disabled={isPlaying}>
        {isPlaying ? 'Playing…' : hasPlayed ? 'Replay audio' : 'Play audio'}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
