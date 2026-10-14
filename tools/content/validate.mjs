// Structural/batch preview: production sources by default, or explicit author files.
// Audio bytes and registry integrity remain mandatory in content:build.
import { parseQuestionBankItemJson, validateQuestionBankItems } from '../../src/domain/content/validation.ts';
import { ContentValidationError } from '../../src/domain/content/validationTypes.ts';
import { readSource } from './read-source.mjs';
import { discover } from './discover.mjs';
import { resolve } from 'node:path';
const files = process.argv.slice(2);
if (!files.length) {
 try { files.push(...(await discover(resolve('content'))).map(source => source.file)); }
 catch (error) { console.log(JSON.stringify({success:false,validatedFiles:0,errors:error.errors ?? [{path:'content',code:'READ_FAILED',message:'Production discovery failed.'}],warnings:[]})); process.exit(1); }
}
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
