import { open } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { AudioRequestError } from './errors.mjs';
import { detectContainer, inspectMedia, inputArguments, runMedia, SYSTEM_MEDIA_TOOLS, PREPROCESS_TIMEOUT_MS } from './media.mjs';

export async function preprocessAudio(files, config, cancellation, options = {}) {
  const tools = options.tools ?? SYSTEM_MEDIA_TOOLS;
  const controller = new AbortController();
  const signal = AbortSignal.any([cancellation, controller.signal]);
  const timer = setTimeout(() => controller.abort(new AudioRequestError(504, 'INFERENCE_TIMEOUT', 'Local audio preprocessing timed out.')),
    options.timeoutMs ?? PREPROCESS_TIMEOUT_MS);
  const started = performance.now();
  try {
    signal.throwIfAborted();
    const format = await detectContainer(files.inputPath);
    const input = await inspectMedia(files.inputPath, format, signal, tools);
    const claimed = input.format?.duration;
    if (claimed !== undefined && claimed !== 'N/A') {
      const duration = Number(claimed);
      if (!Number.isFinite(duration) || duration <= 0) throw new AudioRequestError(422, 'AUDIO_DECODE_FAILED', 'The recording has no usable duration.');
      if (duration > config.maxAudioSeconds) throw new AudioRequestError(413, 'AUDIO_TOO_LARGE', 'The recording is too long.');
    }
    // Decode one second beyond the acceptance limit. Durationless inputs exceeding
    // it are rejected, never accepted as a truncated learner attempt. -fs is a
    // second disk cap with room for the complete probe interval and WAV headers.
    const outputFile = await open(files.normalizedPath, 'wx', 0o600);
    await outputFile.close();
    await runMedia(tools.ffmpeg, ['-nostdin', '-v', 'error', '-max_alloc', '16777216', '-xerror', ...inputArguments(format, files.inputPath),
      '-map', '0:a:0', '-vn', '-sn', '-dn', '-t', String(config.maxAudioSeconds + 1),
      '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-threads', '1', '-f', 'wav',
      '-fs', String((config.maxAudioSeconds + 2) * 32000 + 65536), '-y', files.normalizedPath], signal);
    const output = await inspectMedia(files.normalizedPath, 'wav', signal, tools);
    const stream = output.streams[0];
    const seconds = Number(output.format?.duration);
    if (stream.codec_name !== 'pcm_s16le' || stream.sample_rate !== '16000' || stream.channels !== 1 || output.format?.format_name !== 'wav'
      || !Number.isFinite(seconds) || seconds <= 0) throw new AudioRequestError(422, 'AUDIO_DECODE_FAILED', 'The normalized recording is unusable.');
    if (seconds > config.maxAudioSeconds) throw new AudioRequestError(413, 'AUDIO_TOO_LARGE', 'The recording is too long.');
    return { normalizedPath: files.normalizedPath, durationMs: Math.round(seconds * 1000), sampleRate: 16000, channels: 1,
      codec: 'pcm_s16le', format: 'wav', preprocessingMs: Math.round(performance.now() - started) };
  } finally { clearTimeout(timer); }
}
