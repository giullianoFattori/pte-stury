import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { MODEL_MANIFEST, DEVELOPMENT_ARTIFACTS } from '../../runtime/src/whisper.mjs';

export async function hashFile(path) {
  const sha1 = createHash('sha1'), sha256 = createHash('sha256');
  for await (const bytes of createReadStream(path)) { sha1.update(bytes); sha256.update(bytes); }
  return { sha1: sha1.digest('hex'), sha256: sha256.digest('hex') };
}

export async function verifyModel(id, root = DEVELOPMENT_ARTIFACTS.modelRoot) {
  if (!Object.hasOwn(MODEL_MANIFEST, id)) throw new Error('Unsupported model.');
  const manifest = MODEL_MANIFEST[id], path = join(root, manifest.filename);
  const before = await stat(path), hashes = await hashFile(path), after = await stat(path);
  if (!before.isFile() || before.size < manifest.minBytes || before.size > manifest.maxBytes
    || hashes.sha1 !== manifest.sha1 || (manifest.sha256 && hashes.sha256 !== manifest.sha256)
    || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('Model integrity failure.');
  return { id, filename: manifest.filename, bytes: before.size, ...hashes,
    trustedSource: 'https://huggingface.co/ggerganov/whisper.cpp',
    acquisition: 'Pinned whisper.cpp v1.8.3 official download-ggml-model.sh; upstream SHA-1 verified; SHA-256 measured locally' };
}
