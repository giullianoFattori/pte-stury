// Packaging verification primitive. It is not an HTTP/config/environment path API.
import { open, lstat, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute } from 'node:path';
import { RuntimeStartupError } from './errors.mjs';

export function validateArtifactManifest(value) {
  const fail = () => { throw new RuntimeStartupError('ARTIFACT_INTEGRITY_FAILED', 'Packaged artifact inventory is invalid.'); };
  if (value?.manifestVersion !== 1 || !/^\d+\.\d+\.\d+$/.test(value.runtimeVersion ?? '')
    || !['linux', 'darwin', 'win32'].includes(value.platform) || !['x64', 'arm64'].includes(value.arch)
    || !Array.isArray(value.artifacts) || value.artifacts.length < 1 || value.artifacts.length > 4096) fail();
  const ids = new Set(), paths = new Set();
  for (const artifact of value.artifacts) {
    if (!/^[a-z0-9][a-z0-9.-]{0,63}$/.test(artifact.id ?? '') || ids.has(artifact.id)
      || !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? '') || !Number.isSafeInteger(artifact.size) || artifact.size < 1
      || typeof artifact.path !== 'string' || isAbsolute(artifact.path) || artifact.path.includes('\\')
      || !/^[a-zA-Z0-9._/+-]+$/.test(artifact.path) || artifact.path.split('/').some(part => !part || part === '.' || part === '..')
      || paths.has(artifact.path) || !['executable', 'model', 'library', 'frontend', 'runtime', 'license', 'metadata'].includes(artifact.kind)) fail();
    ids.add(artifact.id); paths.add(artifact.path);
  }
  return value;
}

export async function verifyArtifactManifest(value, packageRoot, signal = new AbortController().signal) {
  validateArtifactManifest(value);
  const fail = () => new RuntimeStartupError('ARTIFACT_INTEGRITY_FAILED', 'A packaged artifact is unavailable or invalid.');
  try {
    const root = await realpath(packageRoot);
    for (const artifact of value.artifacts) {
      signal.throwIfAborted();
      const path = resolve(root, artifact.path), canonical = await realpath(path), rel = relative(root, canonical);
      if (rel.startsWith('..') || isAbsolute(rel) || canonical !== path) throw fail();
      const before = await lstat(path);
      if (!before.isFile() || before.isSymbolicLink()) throw fail();
      const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
      try {
        const opened = await file.stat();
        if (!opened.isFile() || opened.size !== artifact.size || opened.dev !== before.dev || opened.ino !== before.ino) throw fail();
        const hash = createHash('sha256'), buffer = Buffer.alloc(1048576);
        let position = 0;
        while (position < artifact.size) {
          signal.throwIfAborted();
          const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, artifact.size - position), position);
          if (!bytesRead) throw fail();
          hash.update(buffer.subarray(0, bytesRead)); position += bytesRead;
        }
        const after = await file.stat(), final = await lstat(path);
        if (hash.digest('hex') !== artifact.sha256 || [after, final].some(stat => stat.ino !== opened.ino || stat.dev !== opened.dev
          || stat.size !== opened.size || stat.mtimeMs !== opened.mtimeMs || stat.ctimeMs !== opened.ctimeMs)) throw fail();
      } finally { await file.close(); }
    }
    return true;
  } catch { if (signal.aborted) throw signal.reason; throw fail(); }
}
