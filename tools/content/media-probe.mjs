import { resolve } from 'node:path';
import { runNative, configurePackagedLibraries } from '../../runtime/src/nativeProcess.mjs';
import { createMediaIntegrity, SYSTEM_MEDIA_TOOLS } from '../../runtime/src/media.mjs';

export class AudioError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export const failAudio = (code, message) => { throw new AudioError(code, message); };
export const MEDIA_TIMEOUT_MS = 30000;
// Developer tools use fixed system executables; platform build callers may supply
// their trusted staged binaries through this internal API, never through content.
export async function createAudioMedia(tools) {
  if (!tools) {
    if (process.platform === 'linux') tools = SYSTEM_MEDIA_TOOLS;
    else {
      const target = process.platform === 'win32' && process.arch === 'x64' ? 'windows-x64'
        : process.platform === 'darwin' && ['x64', 'arm64'].includes(process.arch) ? 'macos-' + process.arch : undefined;
      if (!target) failAudio('AUDIO_TOOLS_UNAVAILABLE', 'Native content tools are not configured for this target.');
      const nativeRoot = resolve('.local-packaging/inputs', target, 'native'), suffix = process.platform === 'win32' ? '.exe' : '';
      configurePackagedLibraries(nativeRoot);
      tools = { ffmpeg: resolve(nativeRoot, 'ffmpeg' + suffix), ffprobe: resolve(nativeRoot, 'ffprobe' + suffix) };
    }
  }
  const integrity = await createMediaIntegrity(tools);
  async function run(executable, args, code) {
    await integrity.verify();
    const error = () => new AudioError(code, 'Local media validation failed or exceeded its bounded execution budget.');
    const bytes = await runNative(executable, args, { signal: new AbortController().signal,
      timeoutMs: MEDIA_TIMEOUT_MS, unavailable: error, failed: error, timeout: error });
    await integrity.verify();
    return bytes;
  }
  // Force the sole allowed demuxer, with only local file protocol. No playlists,
  // automatic format selection, external URLs, interactive input or shell.
  const input = path => ['-max_alloc', '16777216', '-probesize', '1048576', '-analyzeduration', '5000000',
    '-protocol_whitelist', 'file', '-format_whitelist', 'mp3', '-f', 'mp3', '-i', path];
  return {
    async probe(path) {
      try {
        const bytes = await run(tools.ffprobe, ['-v', 'error', ...input(path), '-show_entries',
          'stream=codec_type,codec_name,sample_rate,channels:format=format_name,duration', '-of', 'json'], 'AUDIO_PROBE_FAILED');
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      } catch { failAudio('AUDIO_PROBE_FAILED', 'Audio metadata could not be inspected safely.'); }
    },
    async decode(path) {
      const bytes = await run(tools.ffmpeg, ['-nostdin', '-v', 'error', '-xerror', ...input(path), '-map', '0:a:0',
        '-vn', '-sn', '-dn', '-threads', '1', '-t', '181', '-progress', 'pipe:1', '-stats_period', '1', '-f', 'null', '-'], 'AUDIO_DECODE_FAILED');
      const times = [...bytes.toString('utf8').matchAll(/^out_time_us=(\d+)$/gm)].map(match => Number(match[1]));
      const durationMs = times.at(-1) / 1000;
      if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 180000 || !bytes.toString('utf8').includes('progress=end'))
        failAudio('AUDIO_DECODE_FAILED', 'Full decoded audio exceeded the duration budget or produced no usable output.');
      return durationMs;
    },
  };
}
export function inspectAudioMetadata(value) {
  if (!value || !Array.isArray(value.streams) || value.streams.length !== 1 || value.streams[0].codec_type !== 'audio')
    failAudio('AUDIO_MULTIPLE_STREAMS', 'Exactly one audio stream and no other streams are required.');
  if (value.format?.format_name !== 'mp3') failAudio('AUDIO_EXTENSION_MISMATCH', 'MP3 extension must identify an MP3 container.');
  const stream = value.streams[0];
  if (stream.codec_name !== 'mp3') failAudio('AUDIO_UNSUPPORTED_CODEC', 'Only the MP3 codec is supported for authored audio v1.');
  const sampleRate = Number(stream.sample_rate), channels = stream.channels, durationMs = Number(value.format.duration) * 1000;
  if (!Number.isSafeInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000 || ![1, 2].includes(channels))
    failAudio('AUDIO_UNSUPPORTED_LAYOUT', 'Audio must be mono/stereo at 8–96 kHz.');
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 180000)
    failAudio('AUDIO_INVALID_DURATION', 'Audio must have a finite positive duration no longer than 180 seconds.');
  return { durationMs: Math.round(durationMs), mimeType: 'audio/mpeg', container: 'mp3', codec: stream.codec_name, sampleRate, channels };
}
