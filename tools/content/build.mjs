import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareBank } from './pipeline.mjs';
import { installGenerated } from './install.mjs';
import { BuildError } from './discover.mjs';

export async function buildBank({ outputRoot = resolve('src/generated'), installOptions, ...options } = {}) {
  const result = await prepareBank(options);
  await installGenerated(result, outputRoot, installOptions);
  return result;
}
export function reportFailure(error) {
  console.error(JSON.stringify({ success: false, message: 'Build failed; no new content build produced.', errors: error instanceof BuildError ? error.errors : [{ file: 'src/generated', path: '$', code: 'OUTPUT_FAILED', message: 'Generated output could not be installed safely.' }], warnings: error instanceof BuildError ? error.warnings : [] }, null, 2));
  process.exitCode = 1;
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  try {
    if (process.argv.length > 2) throw new BuildError([{ file: 'content', path: '$', code: 'INVALID_ARGUMENTS', message: 'Production build accepts no flags; empty-bank mode is available only through the test API.' }]);
    const result = await buildBank();
    console.log(JSON.stringify({ success: true, discoveredItems: result.discoveredItems, errors: [], warnings: result.warnings, ...result.stats, contentVersion: result.manifest.contentVersion, outputs: ['src/generated/question-bank.json', 'src/generated/question-bank.manifest.json'] }, null, 2));
  } catch (error) { reportFailure(error); }
}
