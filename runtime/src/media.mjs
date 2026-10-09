import { runNative } from './nativeProcess.mjs';
import { open, lstat, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { AudioRequestError } from './errors.mjs';

export const SYSTEM_MEDIA_TOOLS = Object.freeze({ ffmpeg: '/usr/bin/ffmpeg', ffprobe: '/usr/bin/ffprobe' });
export const PREPROCESS_TIMEOUT_MS = 30000;
const decodeError = () => new AudioRequestError(422, 'AUDIO_DECODE_FAILED', 'The recording could not be decoded.');

const mediaUnavailable = () => new AudioRequestError(503, 'RUNTIME_UNAVAILABLE', 'The local audio tools are unavailable or changed.');
const identity = stat => [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':');
async function mediaIdentity(path) {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) throw mediaUnavailable();
  await access(path, constants.X_OK);
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const opened = await file.stat();
    if (!opened.isFile() || identity(opened) !== identity(before)) throw mediaUnavailable();
    return identity(opened);
  } finally { await file.close(); }
}

// Development trusts the system install at startup. Packaging must authenticate
// hashes in the shipped manifest first; fingerprints only detect later mutation.
export async function createMediaIntegrity(tools = SYSTEM_MEDIA_TOOLS) {
  let identities;
  try { identities = await Promise.all([mediaIdentity(tools.ffprobe), mediaIdentity(tools.ffmpeg)]); }
  catch { throw mediaUnavailable(); }
  return Object.freeze({ async verify() {
    try {
      const now = await Promise.all([mediaIdentity(tools.ffprobe), mediaIdentity(tools.ffmpeg)]);
      if (now.some((value, index) => value !== identities[index])) throw mediaUnavailable();
    } catch { throw mediaUnavailable(); }
  } });
}

export async function runMedia(executable, args, signal) {
  const output = await runNative(executable, args, { signal, timeoutMs: PREPROCESS_TIMEOUT_MS,
    unavailable: decodeError, failed: decodeError,
    timeout: () => new AudioRequestError(504, 'INFERENCE_TIMEOUT', 'Local audio preprocessing timed out.') });
  return output.toString('utf8');
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
