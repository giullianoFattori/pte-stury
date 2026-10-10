// Thin preview only: three explicit examples or files supplied by the author.
// Production discovery/build/sync is deliberately not part of 06.02.
import { parseQuestionBankItemJson, validateQuestionBankItems } from '../../src/domain/content/validation.ts';
import { ContentValidationError } from '../../src/domain/content/validationTypes.ts';
import { readSource } from './read-source.mjs';
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
