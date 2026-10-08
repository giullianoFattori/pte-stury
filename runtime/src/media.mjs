import { spawn } from 'node:child_process';
import { open } from 'node:fs/promises';
import { AudioRequestError } from './errors.mjs';

export const SYSTEM_MEDIA_TOOLS = Object.freeze({ ffmpeg: '/usr/bin/ffmpeg', ffprobe: '/usr/bin/ffprobe' });
export const PREPROCESS_TIMEOUT_MS = 30000;
const decodeError = () => new AudioRequestError(422, 'AUDIO_DECODE_FAILED', 'The recording could not be decoded.');

export async function runMedia(executable, args, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let size = 0, failure;
    const stop = error => { failure ??= error; child.kill('SIGKILL'); };
    const abort = () => stop(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > 65536) stop(decodeError()); else chunks.push(chunk);
    });
    let stderrBytes = 0;
    child.stderr.on('data', chunk => { stderrBytes += chunk.length; if (stderrBytes > 65536) stop(decodeError()); });
    child.on('error', () => { failure ??= decodeError(); });
    child.once('close', code => {
      signal.removeEventListener('abort', abort);
      if (failure || code !== 0) reject(failure ?? decodeError()); else resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
}

export async function detectContainer(path) {
  const file = await open(path, 'r');
  const bytes = Buffer.alloc(16);
  try { await file.read(bytes, 0, bytes.length, 0); } finally { await file.close(); }
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WAVE') return 'wav';
  if (bytes.subarray(0, 4).toString() === 'OggS') return 'ogg';
  if (bytes.readUInt32BE(0) === 0x1a45dfa3) return 'matroska';
  if (['ftyp', 'moov', 'mdat'].includes(bytes.subarray(4, 8).toString())) return 'mov';
  throw new AudioRequestError(415, 'AUDIO_UNSUPPORTED', 'The recording container is not supported.');
}

export function inputArguments(format, path) {
  // Force a magic-approved demuxer: playlists/manifests are never auto-detected.
  // MOV external data references remain disabled, including absolute local paths.
  return ['-probesize', '1048576', '-analyzeduration', '5000000', '-protocol_whitelist', 'file', '-format_whitelist', 'wav,ogg,matroska,mov', '-f', format,
    ...(format === 'mov' ? ['-enable_drefs', '0', '-use_absolute_path', '0'] : []), '-i', path];
}

export async function inspectMedia(path, format, signal, tools = SYSTEM_MEDIA_TOOLS) {
  let value;
  try {
    value = JSON.parse(await runMedia(tools.ffprobe, ['-v', 'error', '-max_alloc', '16777216', ...inputArguments(format, path),
      '-show_entries', 'stream=codec_type,codec_name,sample_rate,channels:format=format_name,duration', '-of', 'json'], signal));
  } catch (error) { if (signal.aborted) throw signal.reason; if (error instanceof AudioRequestError) throw error; throw decodeError(); }
  if (!Array.isArray(value.streams) || value.streams.length !== 1 || value.streams[0].codec_type !== 'audio') {
    throw new AudioRequestError(415, 'AUDIO_UNSUPPORTED', 'The recording must contain one audio stream and no video.');
  }
  const stream = value.streams[0];
  if (!['opus', 'vorbis', 'aac', 'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le', 'pcm_u8', 'flac'].includes(stream.codec_name)
    || !Number.isSafeInteger(Number(stream.sample_rate)) || Number(stream.sample_rate) <= 0 || Number(stream.sample_rate) > 192000
    || !Number.isInteger(stream.channels) || stream.channels < 1 || stream.channels > 8) {
    throw new AudioRequestError(415, 'AUDIO_UNSUPPORTED', 'The recording audio stream is not supported.');
  }
  return value;
}
