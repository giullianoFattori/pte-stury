import { AudioAnalysisError, type DecodedMonoAudio } from '../../domain/audio-analysis/types.ts';

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

export async function decodeAudioBlob(blob: Blob): Promise<DecodedMonoAudio> {
  if (!blob.size) throw new AudioAnalysisError('empty-audio', 'No usable audio was found in the recording.');
  const Constructor = typeof window === 'undefined' ? undefined
    : window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!Constructor) throw new AudioAnalysisError('unsupported', 'Audio analysis is not supported in this browser.');
  try {
    const context = new Constructor();
    try {
      const audio = await context.decodeAudioData(await blob.arrayBuffer());
      if (!Number.isInteger(audio.numberOfChannels) || audio.numberOfChannels <= 0
        || !Number.isInteger(audio.length) || audio.length <= 0 || !Number.isFinite(audio.sampleRate)
        || audio.sampleRate <= 0 || !Number.isFinite(audio.duration) || audio.duration <= 0) {
        throw new AudioAnalysisError('empty-audio', 'No usable audio was found in the recording.');
      }
      const samples = new Float32Array(audio.length);
      for (let channel = 0; channel < audio.numberOfChannels; channel += 1) {
        const data = audio.getChannelData(channel);
        for (let i = 0; i < samples.length; i += 1) {
          if (!Number.isFinite(data[i])) throw new AudioAnalysisError('decode-failed', 'This recording could not be decoded for audio analysis.');
          samples[i] += data[i] / audio.numberOfChannels;
        }
      }
      const durationMs = samples.length / audio.sampleRate * 1000;
      if (!Number.isFinite(durationMs)) throw new AudioAnalysisError('empty-audio', 'No usable audio was found in the recording.');
      return { samples, sampleRate: audio.sampleRate, durationMs };
    } finally {
      if (context.state !== 'closed') await context.close();
    }
  } catch (error) {
    if (error instanceof AudioAnalysisError) throw error;
    throw new AudioAnalysisError('decode-failed', 'This recording could not be decoded for audio analysis.');
  }
}
