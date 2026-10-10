import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { verifyGenerated } from '../tools/content/verify.mjs';
import { jsonBytes } from '../tools/content/canonicalize.mjs';

// Build-time only. The packaged runtime needs neither TS authoring tools nor crypto discovery.
export async function stageGeneratedContent(packageRoot, sourceRoot = resolve('src/generated')) {
  const { bundle, manifest } = await verifyGenerated(sourceRoot);
  const target = join(packageRoot, 'web/content');
  await mkdir(target, { recursive: true });
  await writeFile(join(target, 'question-bank.json'), jsonBytes(bundle));
  await writeFile(join(target, 'question-bank.manifest.json'), jsonBytes(manifest));
  return manifest;
}
