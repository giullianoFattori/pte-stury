import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);
export const MAX_BYTES = 12 * 1024 * 1024;
export const MAX_SECONDS = 180;
export const audioTypes = new Set(['audio/webm', 'video/webm', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/mpeg']);

export class PocError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function withNormalizedAudio(bytes, processAudio, signal) {
  if (!bytes.length || bytes.length > MAX_BYTES) throw new PocError(413, 'Audio must be 1 byte to 12 MiB.');
  const directory = await mkdtemp(join(tmpdir(), 'pte-local-stt-'));
  try {
    const input = join(directory, 'input');
    const wav = join(directory, 'normalized.wav');
    await writeFile(input, bytes, { mode: 0o600 });
    let probe;
    try {
      const { stdout } = await run('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_format', '-show_streams', '-of', 'json', input], { timeout: 10000, maxBuffer: 128 * 1024, signal });
      probe = JSON.parse(stdout);
    } catch { throw new PocError(415, 'Invalid or unsupported audio.'); }
    const formats = probe.format?.format_name?.split(',') ?? [];
    if (!formats.some(format => ['wav', 'ogg', 'webm', 'matroska', 'mov', 'mp4', 'm4a', 'mp3'].includes(format))
      || !probe.streams?.some(stream => stream.codec_type === 'audio')
      || probe.streams.some(stream => stream.codec_type !== 'audio')) {
      throw new PocError(415, 'Only audio containers are accepted.');
    }
    const declaredDuration = Number(probe.format.duration);
    if (Number.isFinite(declaredDuration) && declaredDuration > MAX_SECONDS) throw new PocError(413, 'Audio exceeds 180 seconds.');
    // WebM from MediaRecorder may lack duration. Decode one extra second to reject rather than truncate.
    await run('ffmpeg', ['-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', input,
      '-map', '0:a:0', '-t', String(MAX_SECONDS + 1), '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-y', wav],
    { timeout: 30000, maxBuffer: 128 * 1024, signal });
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', wav], { timeout: 10000, signal });
    const normalized = JSON.parse(stdout);
    const duration = Number(normalized.format.duration);
    if (!(duration > 0) || duration > MAX_SECONDS) throw new PocError(413, 'Audio must be between 0 and 180 seconds.');
    if (normalized.streams[0].sample_rate !== '16000' || normalized.streams[0].channels !== 1
      || normalized.streams[0].codec_name !== 'pcm_s16le') throw new Error('Unexpected normalized audio format.');
    return await processAudio({ wav, directory, duration, bytes: await readFile(wav) });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function inferWav(bytes, signal) {
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: 'audio/wav' }), 'recording.wav');
  form.set('response_format', 'json');
  form.set('language', 'en');
  form.set('temperature', '0');
  // Never accept a prompt, expected text, model path, filename or URL from the browser.
  const started = performance.now();
  const response = await fetch('http://127.0.0.1:8765/inference', { method: 'POST', body: form,
    signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(180000)]) });
  if (!response.ok) throw new PocError(502, 'Local whisper-server inference failed.');
  const result = await response.json();
  if (typeof result.text !== 'string') throw new PocError(502, 'Unexpected whisper-server response.');
  return { text: result.text.trim(), language: 'en', engine: 'whisper.cpp', processedLocally: true,
    inferenceSeconds: (performance.now() - started) / 1000 };
}
