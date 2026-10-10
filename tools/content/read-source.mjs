import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { ContentValidationError } from '../../src/domain/content/validationTypes.ts';
import { CONTENT_LIMITS } from '../../src/domain/content/validationPolicy.ts';

export const SOURCE_BYTE_LIMIT = CONTENT_LIMITS.jsonCodeUnits * 4;
export async function readSource(file, maximum = SOURCE_BYTE_LIMIT) {
  const before = await lstat(file);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('Source must be a regular file');
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino) throw new Error('Source changed while opening');
    const tooLarge = () => new ContentValidationError([{ path: '$', code: 'JSON_TOO_LARGE', message: 'JSON source byte budget exceeded.' }]);
    if (stat.size > maximum) throw tooLarge();
    const chunks = []; let total = 0;
    for (;;) {
      const buffer = Buffer.alloc(65536), { bytesRead } = await handle.read(buffer);
      if (!bytesRead) break;
      total += bytesRead; if (total > maximum) throw tooLarge();
      chunks.push(buffer.subarray(0, bytesRead));
    }
    const after = await handle.stat();
    if (total !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) throw new Error('Source changed while reading');
    try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks)); }
    catch { throw new ContentValidationError([{ path: '$', code: 'INVALID_JSON', message: 'JSON source must contain valid UTF-8.' }]); }
  } finally { await handle.close(); }
}
