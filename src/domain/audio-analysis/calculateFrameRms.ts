export function calculateFrameRms(samples: Float32Array, start: number, end: number): number {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > samples.length) {
    throw new RangeError('Invalid RMS sample range.');
  }
  if (start === end) return 0;
  let energy = 0;
  for (let i = start; i < end; i += 1) {
    if (!Number.isFinite(samples[i])) throw new RangeError('Audio samples must be finite.');
    energy += samples[i] * samples[i];
  }
  return Math.sqrt(energy / (end - start));
}
