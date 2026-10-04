export type DecodedMonoAudio = {
  samples: Float32Array;
  sampleRate: number;
  durationMs: number;
};

export class AudioAnalysisError extends Error {
  readonly code: 'unsupported' | 'decode-failed' | 'empty-audio';

  constructor(code: AudioAnalysisError['code'], message: string) {
    super(message);
    this.name = 'AudioAnalysisError';
    this.code = code;
  }
}

export type AudioFrame = {
  index: number;
  startMs: number;
  endMs: number;
  rms: number;
  db: number;
  isSpeech: boolean;
};

export type SpeechSegment = { startMs: number; endMs: number; durationMs: number };
export type PauseSegment = { startMs: number; endMs: number; durationMs: number };

export type SpeechSegmentationConfig = {
  frameMs: number;
  hopMs: number;
  minimumSpeechMs: number;
  minimumPauseMs: number;
  mergeGapMs: number;
  noisePercentile: number;
  thresholdDbAboveNoise: number;
};

export type SpeechSegmentationResult = {
  durationMs: number;
  noiseFloorDb: number;
  thresholdDb: number;
  frames: AudioFrame[];
  speechSegments: SpeechSegment[];
  pauseSegments: PauseSegment[];
};
