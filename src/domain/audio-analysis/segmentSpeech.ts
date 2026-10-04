import { calculateFrameRms } from './calculateFrameRms.ts';
import type { AudioFrame, SpeechSegmentationConfig, SpeechSegmentationResult } from './types';

export const DEFAULT_SPEECH_SEGMENTATION_CONFIG = {
  frameMs: 30, hopMs: 10, minimumSpeechMs: 150, minimumPauseMs: 150,
  mergeGapMs: 120, noisePercentile: 0.20, thresholdDbAboveNoise: 12,
} satisfies SpeechSegmentationConfig;

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

type FrameRun = { start: number; end: number; isSpeech: boolean };

function runs(frames: AudioFrame[]): FrameRun[] {
  const result: FrameRun[] = [];
  for (let start = 0; start < frames.length;) {
    let end = start + 1;
    while (end < frames.length && frames[end].isSpeech === frames[start].isSpeech) end += 1;
    result.push({ start, end, isSpeech: frames[start].isSpeech });
    start = end;
  }
  return result;
}

export function segmentSpeech(
  samples: Float32Array, sampleRate: number, config: Partial<SpeechSegmentationConfig> = {},
): SpeechSegmentationResult {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new RangeError('Invalid sample rate.');
  const settings = { ...DEFAULT_SPEECH_SEGMENTATION_CONFIG, ...config };
  if (Object.values(settings).some(value => !Number.isFinite(value))
    || settings.frameMs <= 0 || settings.hopMs <= 0 || settings.hopMs > settings.frameMs
    || settings.minimumSpeechMs < 0 || settings.minimumPauseMs < 0 || settings.mergeGapMs < 0
    || settings.noisePercentile < 0 || settings.noisePercentile > 1 || settings.thresholdDbAboveNoise < 0) {
    throw new RangeError('Invalid speech segmentation configuration.');
  }
  const frameSize = Math.max(1, Math.round(sampleRate * settings.frameMs / 1000));
  const hopSize = Math.max(1, Math.round(sampleRate * settings.hopMs / 1000));
  const durationMs = samples.length / sampleRate * 1000;
  if (!Number.isFinite(durationMs) || !Number.isSafeInteger(frameSize) || !Number.isSafeInteger(hopSize)) {
    throw new RangeError('Invalid audio timing.');
  }
  const frames: AudioFrame[] = [];
  for (let start = 0; start < samples.length; start += hopSize) {
    const end = Math.min(samples.length, start + frameSize);
    const rms = calculateFrameRms(samples, start, end);
    frames.push({ index: frames.length, startMs: start / sampleRate * 1000,
      endMs: end / sampleRate * 1000, rms, db: 20 * Math.log10(Math.max(rms, 1e-12)), isSpeech: false });
  }
  const noiseFloorDb = frames.length ? percentile(frames.map(frame => frame.db), settings.noisePercentile) : -240;
  const thresholdDb = Math.max(-60, Math.min(-20, noiseFloorDb + settings.thresholdDbAboveNoise));
  for (const frame of frames) frame.isSpeech = frame.db >= thresholdDb;

  // Windows overlap; labels own non-overlapping hop cells for segment timing.
  const endTime = (run: FrameRun) => frames[run.end]?.startMs ?? durationMs;
  for (const run of runs(frames)) {
    if (!run.isSpeech && run.start > 0 && run.end < frames.length
      && endTime(run) - frames[run.start].startMs < settings.mergeGapMs) {
      for (let i = run.start; i < run.end; i += 1) frames[i].isSpeech = true;
    }
  }
  for (const run of runs(frames)) {
    if (run.isSpeech && endTime(run) - frames[run.start].startMs < settings.minimumSpeechMs) {
      for (let i = run.start; i < run.end; i += 1) frames[i].isSpeech = false;
    }
  }
  const speechSegments: SpeechSegmentationResult['speechSegments'] = [];
  const pauseSegments: SpeechSegmentationResult['pauseSegments'] = [];
  for (const run of runs(frames)) {
    const startMs = frames[run.start].startMs;
    const endMs = Math.min(durationMs, endTime(run));
    const segment = { startMs, endMs, durationMs: endMs - startMs };
    if (run.isSpeech) speechSegments.push(segment);
    // Keep all edge silence; subminimum interior gaps remain available in frames.
    else if (run.start === 0 || run.end === frames.length || segment.durationMs >= settings.minimumPauseMs) {
      pauseSegments.push(segment);
    }
  }
  return { durationMs, noiseFloorDb, thresholdDb, frames, speechSegments, pauseSegments };
}
