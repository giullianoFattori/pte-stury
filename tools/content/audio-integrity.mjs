import { lstat, open, realpath, opendir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, relative, join, sep, extname, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { AUDIO_PATH_PATTERN, CONTENT_LIMITS } from '../../src/domain/content/validationPolicy.ts';
import { AudioError, failAudio, createAudioMedia, inspectAudioMetadata } from './media-probe.mjs';

export const AUDIO_MAX_BYTES = 20 * 1024 * 1024;
const identity = stat => [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':');
const diagnostic = (item, code, message) => ({ itemId: item.id, file: item.audio.path, path: 'audio', code, message });
async function trustedDirectory(path) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || await realpath(path) !== resolve(path)) failAudio('AUDIO_SYMLINK', 'Audio directories cannot contain symlink components.');
  if (!stat.isDirectory()) failAudio('AUDIO_NOT_REGULAR_FILE', 'Audio parent must be a directory.');
}
export async function resolveAudioPath(authoredPath, audioRoot = resolve('public/audio')) {
  if (typeof authoredPath !== 'string' || authoredPath.length > CONTENT_LIMITS.audioPath || !new RegExp(AUDIO_PATH_PATTERN).test(authoredPath))
    failAudio('INVALID_AUDIO_PATH', 'Expected a safe local /audio/ path.');
  const root = resolve(audioRoot), target = resolve(root, authoredPath.slice('/audio/'.length));
  const within = relative(root, target);
  if (!within || within === '..' || within.startsWith('..' + sep) || resolve(root, within) !== target)
    failAudio('INVALID_AUDIO_PATH', 'Audio reference must remain beneath the managed audio root.');
  await trustedDirectory(root);
  let directory = root;
  for (const component of relative(root, dirname(target)).split(sep).filter(Boolean)) {
    directory = join(directory, component); await trustedDirectory(directory);
  }
  return target;
}
async function inspectFile(path, media) {
  const before = await lstat(path);
  if (before.isSymbolicLink()) failAudio('AUDIO_SYMLINK', 'Audio symlinks are forbidden.');
  if (!before.isFile()) failAudio('AUDIO_NOT_REGULAR_FILE', 'Audio must be a regular file.');
  if (before.size <= 0) failAudio('AUDIO_EMPTY', 'Audio must contain bytes.');
  if (before.size > AUDIO_MAX_BYTES) failAudio('AUDIO_TOO_LARGE', 'Audio exceeds the 20 MiB safety limit.');
  if (extname(path) !== '.mp3') failAudio('AUDIO_EXTENSION_MISMATCH', 'Authored audio v1 supports only lowercase .mp3 files.');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    if (identity(await handle.stat()) !== identity(before)) failAudio('AUDIO_CHANGED', 'Audio changed while opening.');
    const hash = createHash('sha256'), buffer = Buffer.alloc(65536);
    let total = 0, header;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      header ??= Buffer.from(buffer.subarray(0, Math.min(bytesRead, 16)));
      total += bytesRead;
      if (total > AUDIO_MAX_BYTES) failAudio('AUDIO_TOO_LARGE', 'Audio grew beyond its byte budget.');
      hash.update(buffer.subarray(0, bytesRead));
    }
    // Reject obvious container disguises before invoking the forced MP3 demuxer.
    if (!header || !(header.toString('ascii', 0, 3) === 'ID3' || (header[0] === 255 && (header[1] & 0xe0) === 0xe0)))
      failAudio('AUDIO_EXTENSION_MISMATCH', 'MP3 extension does not match MP3 signature.');
    const stable = async () => {
      await trustedDirectory(dirname(path));
      const current = await lstat(path);
      if (!current.isFile() || current.isSymbolicLink() || identity(current) !== identity(before) || identity(await handle.stat()) !== identity(before))
        failAudio('AUDIO_CHANGED', 'Audio changed during validation.');
    };
    await stable();
    const metadata = inspectAudioMetadata(await media.probe(path));
    await stable(); await media.decode(path); await stable();
    if (total !== before.size) failAudio('AUDIO_CHANGED', 'Audio size changed during validation.');
    return { sizeBytes: total, sha256: hash.digest('hex'), ...metadata };
  } finally { await handle.close(); }
}
export async function validateAudioAssets(items, { audioRoot = resolve('public/audio'), media, reportOrphans = true } = {}) {
  const errors = [], warnings = [], assets = [], cache = new Map(), recorded = new Set();
  // Resolve tools lazily: audio-free banks need no native tools installed.
  let checker = media;
  for (const item of items) {
    if (!item.audio) continue;
    try {
      const path = await resolveAudioPath(item.audio.path, audioRoot);
      if (!cache.has(path)) {
        checker ??= await createAudioMedia();
        cache.set(path, inspectFile(path, checker));
      }
      const actual = await cache.get(path);
      if (!recorded.has(item.audio.path)) { recorded.add(item.audio.path); assets.push({ path: item.audio.path, ...actual }); }
      if (item.audio.sha256 !== undefined && item.audio.sha256 !== actual.sha256) failAudio('AUDIO_HASH_MISMATCH', 'Declared SHA-256 does not match file bytes.');
      if (item.audio.durationMs !== undefined && Math.abs(item.audio.durationMs - actual.durationMs) > Math.max(100, actual.durationMs * 0.01))
        failAudio('AUDIO_DURATION_MISMATCH', 'Declared duration differs by more than max(100 ms, 1%).');
      if (item.audio.mimeType !== undefined && item.audio.mimeType !== actual.mimeType) failAudio('AUDIO_MIME_MISMATCH', 'Declared MIME must match the MP3 container (audio/mpeg).');
      if (item.status !== 'draft' && item.audio.sha256 === undefined) failAudio('REQUIRED_FIELD', 'Published audio requires declared SHA-256.');
      if (item.status !== 'draft' && item.audio.durationMs === undefined) warnings.push(diagnostic(item, 'AUDIO_DURATION_UNDECLARED', 'Published audio should declare verified durationMs.'));
    } catch (error) {
      errors.push(diagnostic(item, error instanceof AudioError ? error.code : error.code === 'ENOENT' ? 'AUDIO_NOT_FOUND' : 'AUDIO_CHECK_FAILED',
        error instanceof AudioError ? error.message : error.code === 'ENOENT' ? 'Referenced audio does not exist.' : 'Audio could not be checked safely.'));
    }
  }
  if (reportOrphans) {
    try {
      await trustedDirectory(audioRoot);
      let visited = 0;
      async function scan(directory, depth) {
        if (depth > 16) failAudio('AUDIO_DISCOVERY_LIMIT', 'Audio discovery depth budget exceeded.');
        const names = [];
        for await (const entry of await opendir(directory)) {
          if (++visited > 40000) failAudio('AUDIO_DISCOVERY_LIMIT', 'Audio discovery entry budget exceeded.');
          names.push(entry.name);
        }
        names.sort();
        for (const name of names) {
          const path = join(directory, name), stat = await lstat(path);
          const authored = '/audio/' + relative(audioRoot, path).split(sep).join('/');
          if (stat.isSymbolicLink()) failAudio('AUDIO_SYMLINK', 'Managed audio tree cannot contain symlinks.');
          if (stat.isDirectory()) { await trustedDirectory(path); await scan(path, depth + 1); }
          else if (stat.isFile() && !['.gitkeep', '.DS_Store', 'Thumbs.db'].includes(name) && !cache.has(resolve(path)))
            warnings.push({ file: authored, path: 'audio', code: 'AUDIO_ORPHAN', message: 'Managed audio is not referenced by canonical content; legacy assets may be intentional.' });
        }
      }
      await scan(audioRoot, 0);
    } catch (error) {
      if (!(error.code === 'ENOENT' && !items.some(item => item.audio))) errors.push({ file: '/audio/', path: 'audio',
        code: error instanceof AudioError ? error.code : 'AUDIO_CHECK_FAILED', message: 'Managed audio tree could not be inventoried safely.' });
    }
  }
  assets.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const distribution = field => Object.fromEntries([...new Set(assets.map(a => a[field]))].sort().map(value => [value, assets.filter(a => a[field] === value).length]));
  return { errors, warnings, assets, stats: { referencedAssets: new Set(items.filter(item => item.audio).map(item => item.audio.path)).size, validatedAssets: assets.length,
    missingFiles: errors.filter(e => e.code === 'AUDIO_NOT_FOUND').length, totalBytes: assets.reduce((n, a) => n + a.sizeBytes, 0),
    totalDurationMs: assets.reduce((n, a) => n + a.durationMs, 0), formats: distribution('container'), codecs: distribution('codec') } };
}
