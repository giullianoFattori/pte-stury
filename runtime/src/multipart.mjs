import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { AudioRequestError, invalidAudioRequest } from './errors.mjs';

const MIME = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/x-wav']);
const HEADER_LIMIT = 2048;
export function uploadBoundary(request, config) {
  const contentType = request.headers['content-type'] ?? '';
  const match = /^multipart\/form-data;\s*boundary=(?:"([A-Za-z0-9'()+_,./:=? -]{1,70})"|([A-Za-z0-9'()+_,./:=?-]{1,70}))$/i.exec(contentType);
  if (!match) throw invalidAudioRequest();
  const length = request.headers['content-length'];
  if (length !== undefined && !/^\d+$/.test(length)) throw invalidAudioRequest();
  if (length !== undefined && BigInt(length) > BigInt(config.maxUploadBytes)) throw new AudioRequestError(413, 'AUDIO_TOO_LARGE', 'The recording is too large.');
  return match[1] ?? match[2];
}

function parsePart(bytes, seen) {
  const lines = bytes.toString('latin1').split('\r\n');
  if (lines.length > 4) throw invalidAudioRequest();
  const headers = {};
  for (const line of lines) {
    const match = /^(Content-Disposition|Content-Type):[ \t]*([^\r\n]+)$/i.exec(line);
    if (!match || headers[match[1].toLowerCase()]) throw invalidAudioRequest();
    headers[match[1].toLowerCase()] = match[2];
  }
  // Filename is syntax-checked only; it is never used for storage or logging.
  const disposition = /^form-data;\s*name="(audio|language)"(?:;\s*filename="[^"\r\n]{0,255}")?$/i.exec(headers['content-disposition'] ?? '');
  if (!disposition) throw invalidAudioRequest();
  const name = disposition[1];
  const file = /;\s*filename=/.test(headers['content-disposition']);
  if (seen.has(name) || (name === 'audio') !== file) throw invalidAudioRequest();
  seen.add(name);
  const mime = (headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase();
  if (name === 'audio' && !MIME.has(mime)) throw new AudioRequestError(415, 'AUDIO_UNSUPPORTED', 'The recording format is not supported.');
  if (name === 'language' && headers['content-type'] !== undefined) throw invalidAudioRequest();
  return name;
}

// Narrow two-part streaming parser. Retains only one Node stream chunk plus
// <= 2 KiB headers / <= 78 bytes delimiter tail, never the whole audio body.
export async function receiveAudio(request, path, boundary, config, signal) {
  const file = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
  const delimiter = Buffer.from(`\r\n--${boundary}`);
  const initial = Buffer.from(`--${boundary}\r\n`);
  let pending = Buffer.alloc(0), state = 'initial', part, language = '', bytes = 0, audioBytes = 0;
  const seen = new Set();
  const consume = async data => {
    if (part === 'language') {
      if (language.length + data.length > 2) throw invalidAudioRequest();
      language += data.toString('latin1');
    } else {
      audioBytes += data.length;
      if (audioBytes > config.maxUploadBytes) throw new AudioRequestError(413, 'AUDIO_TOO_LARGE', 'The recording is too large.');
      let offset = 0;
      while (offset < data.length) { signal.throwIfAborted(); offset += (await file.write(data, offset, data.length - offset)).bytesWritten; }
    }
  };
  try {
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      signal.throwIfAborted();
      bytes += chunk.length;
      if (bytes > config.maxUploadBytes) throw new AudioRequestError(413, 'AUDIO_TOO_LARGE', 'The recording is too large.');
      for (let offset = 0; offset < chunk.length; offset += 65536) {
        pending = Buffer.concat([pending, chunk.subarray(offset, offset + 65536)]);
        let progress = true;
        while (progress) {
          progress = false;
          if (state === 'initial' && pending.length >= initial.length) {
            if (!pending.subarray(0, initial.length).equals(initial)) throw invalidAudioRequest();
            pending = pending.subarray(initial.length); state = 'headers'; progress = true;
          } else if (state === 'headers') {
            const end = pending.indexOf('\r\n\r\n');
            if (end > HEADER_LIMIT || (end < 0 && pending.length > HEADER_LIMIT + 3)) throw invalidAudioRequest();
            if (end >= 0) { part = parsePart(pending.subarray(0, end), seen); pending = pending.subarray(end + 4); state = 'body'; progress = true; }
          } else if (state === 'body') {
            const end = pending.indexOf(delimiter);
            if (end >= 0) {
              if (pending.length < end + delimiter.length + 2) {
                await consume(pending.subarray(0, end)); pending = Buffer.from(pending.subarray(end));
              } else {
                const suffix = pending.subarray(end + delimiter.length, end + delimiter.length + 2).toString('latin1');
                if (suffix === '--' || suffix === '\r\n') {
                  await consume(pending.subarray(0, end)); pending = pending.subarray(end + delimiter.length); state = 'suffix';
                } else {
                  // A boundary-like prefix inside binary audio is ordinary data.
                  await consume(pending.subarray(0, end + 2)); pending = pending.subarray(end + 2);
                }
                progress = true;
              }
            } else if (pending.length > delimiter.length + 1) {
              await consume(pending.subarray(0, pending.length - delimiter.length - 1));
              pending = Buffer.from(pending.subarray(-delimiter.length - 1));
            }
          } else if (state === 'suffix' && pending.length >= 2) {
            const suffix = pending.subarray(0, 2).toString('latin1');
            if (suffix !== '--' && suffix !== '\r\n') throw invalidAudioRequest();
            if (part === 'language' && language !== 'en') throw invalidAudioRequest();
            pending = pending.subarray(2); state = suffix === '--' ? 'end' : 'headers'; progress = true;
          } else if (state === 'end' && pending.length > 2) throw invalidAudioRequest();
        }
      }
    }
    signal.throwIfAborted();
    if (state !== 'end' || !(pending.length === 0 || pending.equals(Buffer.from('\r\n'))) || seen.size !== 2 || language !== 'en') throw invalidAudioRequest();
    if (!audioBytes) throw new AudioRequestError(422, 'AUDIO_EMPTY', 'The recording is empty.');
    return { inputBytes: audioBytes };
  } finally { await file.close(); }
}
