export { segmentSpeech, DEFAULT_SPEECH_SEGMENTATION_CONFIG } from './segmentSpeech.ts';
export { calculateFrameRms } from './calculateFrameRms.ts';
export { AudioAnalysisError } from './types.ts';
export type {
  DecodedMonoAudio, AudioFrame, SpeechSegment, PauseSegment,
  SpeechSegmentationConfig, SpeechSegmentationResult,
} from './types';
