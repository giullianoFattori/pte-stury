import { useEffect, useRef, useState } from 'react';

type RsSourceAudioPlayerProps = { audioUrl: string };

export function RsSourceAudioPlayer({ audioUrl }: RsSourceAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    return () => { audio?.pause(); };
  }, []);

  async function playAudio() {
    const audio = audioRef.current;
    if (!audio) return;
    setError(null);
    setIsPlaying(true);
    try {
      audio.currentTime = 0;
      await audio.play();
      setHasPlayed(true);
    } catch (unknownError) {
      if (!audio.isConnected) return;
      console.error('Unable to play RS source audio:', unknownError);
      setIsPlaying(false);
      setError('Unable to play this audio. Please try again.');
    }
  }

  return (
    <div className="rs-source-audio">
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="auto"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => {
          console.error('Unable to load RS source audio:', audioRef.current?.error);
          setIsPlaying(false);
          setError('Unable to play this audio. Please try again.');
        }}
      />
      <button type="button" onClick={() => void playAudio()} disabled={isPlaying}>
        {isPlaying ? 'Playing…' : hasPlayed ? 'Replay sentence' : 'Play sentence'}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
