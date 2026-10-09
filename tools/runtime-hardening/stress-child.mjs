// Test-only launcher. Artifact injection is absent from the production entrypoint.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { main } from '../../runtime/src/main.mjs';
import { createWhisperService } from '../../runtime/src/whisper.mjs';
const base = process.argv[2];
const artifacts = JSON.parse(await readFile(join(base, 'artifacts.json'), 'utf8'));
await main(['--config', join(base, 'config.json')], { tempBase: base,
  initializeEngine: opts => createWhisperService({ ...opts, artifacts }) });
if (globalThis.gc) process.on('SIGUSR2', () => {
  globalThis.gc();
  const { heapUsed, external, arrayBuffers } = process.memoryUsage();
  console.log(JSON.stringify({ event: 'test memory checkpoint', heapUsed, external, arrayBuffers }));
});
if (process.argv[3] === 'uncaught') setTimeout(() => { throw new Error('private /home/learner secret'); }, 200);
if (process.argv[3] === 'rejection') setTimeout(() => { void Promise.reject(new Error('private /home/learner secret')); }, 200);
