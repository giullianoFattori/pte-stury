import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readdir } from 'node:fs/promises';
import { QUESTION_BANK_SCHEMA_VERSION } from '../../src/domain/content/types.ts';
import { validateQuestionBankItems } from '../../src/domain/content/validation.ts';
import { canonicalBundle, jsonBytes } from './canonicalize.mjs';
import { manifestFor } from './manifest.mjs';
import { readSource } from './read-source.mjs';
import { assertDirectory } from './discover.mjs';
import { BANK_BYTE_LIMIT } from './pipeline.mjs';

export const GENERATED_FILES = Object.freeze(['question-bank.json', 'question-bank.manifest.json']);
export function verifyBytes(bundleBytes, manifestBytes) {
  const bundle = JSON.parse(bundleBytes);
  JSON.parse(manifestBytes);
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)
      || Object.keys(bundle).sort().join(',') !== 'items,schemaVersion'
      || bundle.schemaVersion !== QUESTION_BANK_SCHEMA_VERSION) throw new Error('Unsupported bundle shape or schema version');
  const validation = validateQuestionBankItems(bundle.items);
  if (!validation.success) throw new Error('Invalid bundle items');
  const canonical = canonicalBundle(validation.items);
  if (bundleBytes !== jsonBytes(canonical)) throw new Error('Bundle is not canonical');
  const expected = manifestFor(canonical, bundleBytes);
  if (manifestBytes !== jsonBytes(expected)) throw new Error('Manifest or content hash mismatch');
  return { bundle: canonical, manifest: expected, warnings: validation.warnings };
}
export async function verifyGenerated(outputRoot = resolve('src/generated')) {
  await assertDirectory(outputRoot);
  const files = (await readdir(outputRoot)).sort();
  if (files.join(',') !== [...GENERATED_FILES].sort().join(',')) throw new Error('Generated directory must contain exactly the bundle and manifest');
  return verifyBytes(await readSource(join(outputRoot, GENERATED_FILES[0]), BANK_BYTE_LIMIT), await readSource(join(outputRoot, GENERATED_FILES[1])));
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  try { const result = await verifyGenerated(process.argv[2] ? resolve(process.argv[2]) : undefined); console.log(JSON.stringify({ success: true, ...result.manifest }, null, 2)); }
  catch { console.error(JSON.stringify({ success: false, code: 'INVALID_GENERATED_BANK', message: 'Generated bank verification failed.' })); process.exitCode = 1; }
}
