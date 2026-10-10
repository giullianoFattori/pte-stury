// Thin preview only: three explicit examples or files supplied by the author.
// Production discovery/build/sync is deliberately not part of 06.02.
import { open } from 'node:fs/promises';
import { parseQuestionBankItemJson, validateQuestionBankItems } from '../../src/domain/content/validation.ts';
import { ContentValidationError } from '../../src/domain/content/validationTypes.ts';
import { CONTENT_LIMITS } from '../../src/domain/content/validationPolicy.ts';
async function readSource(file) {
  const handle = await open(file, 'r');
  try {
    const maximum = CONTENT_LIMITS.jsonCodeUnits * 4;
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error('Not a regular source file');
    const tooLarge = () => new ContentValidationError([{ path: '$', code: 'JSON_TOO_LARGE', message: 'JSON source byte budget exceeded.' }]);
    if (stat.size > maximum) throw tooLarge();
    const chunks = []; let total = 0;
    for (;;) {
      const buffer = Buffer.alloc(65536), { bytesRead } = await handle.read(buffer);
      if (!bytesRead) break;
      total += bytesRead; if (total > maximum) throw tooLarge();
      chunks.push(buffer.subarray(0, bytesRead));
    }
    try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks)); }
    catch { throw new ContentValidationError([{ path: '$', code: 'INVALID_JSON', message: 'JSON source must contain valid UTF-8.' }]); }
  } finally { await handle.close(); }
}
const files = process.argv.slice(2);
if (!files.length) files.push('content/examples/read-aloud/draft.json', 'content/examples/repeat-sentence/draft.json', 'content/examples/write-from-dictation/draft.json');
const values = [], errors = [], names = [];
for (const file of files) {
  try { values.push(parseQuestionBankItemJson(await readSource(file))); names.push(file); }
  catch (error) {
    if (error instanceof ContentValidationError) errors.push(...error.issues.map(issue => ({ file, ...issue })));
    else errors.push({ file, path: '$', code: 'READ_FAILED', message: 'Content file could not be read.' });
  }
}
const batch = validateQuestionBankItems(values);
const locate = issue => ({ file: names[Number(issue.path.match(/^items\[(\d+)\]/)?.[1])], ...issue });
errors.push(...batch.errors.map(locate));
console.log(JSON.stringify({ success: errors.length === 0, validatedFiles: files.length, errors, warnings: batch.warnings.map(locate) }, null, 2));
if (errors.length) process.exitCode = 1;
