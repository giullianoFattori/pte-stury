import { resolve } from 'node:path';
import { parseQuestionBankItemJson, validateQuestionBankItems } from '../../src/domain/content/validation.ts';
import { ContentValidationError } from '../../src/domain/content/validationTypes.ts';
import { discover, BuildError, issue, assertDirectory } from './discover.mjs';
import { dirname } from 'node:path';
import { readSource } from './read-source.mjs';
import { canonicalBundle, jsonBytes } from './canonicalize.mjs';
import { manifestFor, statsFor } from './manifest.mjs';

export const BANK_BYTE_LIMIT = 128 * 1024 * 1024;
export async function prepareBank({ sourceRoot = resolve('content'), allowEmpty = false } = {}) {
  const files = await discover(sourceRoot), values = [], names = [], errors = [];
  let totalBytes = 0;
  for (const source of files) {
    try {
      await assertDirectory(dirname(source.path));
      const text = await readSource(source.path);
      totalBytes += Buffer.byteLength(text);
      if (totalBytes > BANK_BYTE_LIMIT) throw new BuildError([issue('content', 'BANK_TOO_LARGE', 'Aggregate source byte budget exceeded.')]);
      const item = parseQuestionBankItemJson(text);
      if (item.taskType !== source.task) errors.push(issue(source.file, 'TASK_DIRECTORY_MISMATCH', 'Item taskType must match its registered source directory.', 'taskType'));
      values.push(item); names.push(source.file);
    } catch (error) {
      if (error instanceof BuildError) throw error;
      if (error instanceof ContentValidationError) errors.push(...error.issues.map(entry => ({ file: source.file, ...entry })));
      else errors.push(issue(source.file, 'READ_FAILED', 'Source could not be read safely.'));
    }
  }
  const batch = validateQuestionBankItems(values);
  const locate = entry => ({ file: names[Number(entry.path.match(/^items\[(\d+)\]/)?.[1])] ?? 'content', ...entry });
  errors.push(...batch.errors.map(locate));
  const warnings = batch.warnings.map(locate);
  if (!files.length && !allowEmpty) errors.push(issue('content', 'EMPTY_BANK', 'Production bank must contain at least one item.'));
  if (errors.length) throw new BuildError(errors, warnings);
  const bundle = canonicalBundle(batch.items), bundleBytes = jsonBytes(bundle);
  if (Buffer.byteLength(bundleBytes) > BANK_BYTE_LIMIT) throw new BuildError([issue('content', 'BANK_TOO_LARGE', 'Canonical bundle byte budget exceeded.')], warnings);
  const manifest = manifestFor(bundle, bundleBytes);
  return { bundle, bundleBytes, manifest, manifestBytes: jsonBytes(manifest), stats: statsFor(bundle.items), warnings, discoveredItems: files.length };
}
