// Internal entrypoint; resources derive from installation, never HTTP/config/env.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { main } from './main.mjs';
import { resolvePackagedResources } from './packageResources.mjs';
import { configureLauncherProcessTree, configurePackagedLibraries } from './nativeProcess.mjs';
try {
  if (process.argv.length !== 4 || process.argv[2] !== '--data') throw new Error('Invalid launcher arguments');
  await new Promise((resolve, reject) => {
    process.stdin.once('data', bytes => bytes.length === 1 && bytes[0] === 1 ? resolve() : reject(new Error('Invalid launcher gate')));
    process.stdin.once('end', () => {
      if (process.platform !== 'win32') setTimeout(() => { process.kill(-process.pid, 'SIGKILL'); }, 4000).unref();
      process.emit('SIGTERM'); reject(new Error('Launcher disconnected'));
    });
  });
  process.stdin.on('data', bytes => { if (bytes.length === 1 && bytes[0] === 2) process.emit('SIGTERM'); });
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const options = await resolvePackagedResources(root);
  configureLauncherProcessTree();
  configurePackagedLibraries(resolve(root, 'native'));
  const runtime = await main([], { ...options, tempBase: process.argv[3], config: { apiVersion: 1, host: '127.0.0.1', port: 8765,
    model: 'base.en', maxUploadBytes: 12582912, maxAudioSeconds: 180, inferenceTimeoutMs: 60000, maxConcurrentTranscriptions: 1 } });
  if (!runtime) process.stdin.destroy();
  else runtime.server.once('close', () => process.stdin.destroy());
} catch { process.stdin.destroy(); console.error(JSON.stringify({ event: 'package startup failed', code: 'ARTIFACT_INTEGRITY_FAILED' })); process.exitCode = 1; }
