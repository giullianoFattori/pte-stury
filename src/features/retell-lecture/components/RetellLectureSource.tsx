import type { AudioAsset } from '../../../domain/content/types';
import { LongSourceAudioPlayer } from '../../../shared/components/LongSourceAudioPlayer';

export function RetellLectureSource({ audio, onStart, onEnded, onFailure, disabled }: { audio: AudioAsset; onStart: () => void; onEnded: () => void; onFailure: () => void; disabled: boolean }) {
  return <LongSourceAudioPlayer audioUrl={audio.path} sourceLabel="Lecture audio" primaryLabel="Play lecture"
    replayLabel="Replay lecture (practice assistance)" instruction="Listen once and take notes. Recording is unavailable while audio plays."
    disabled={disabled} onStart={onStart} onEnded={onEnded} onFailure={onFailure} />;
}
