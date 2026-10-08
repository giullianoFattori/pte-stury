import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

export async function launchRuntime(config, context, { realEngine = false, testArtifacts } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'pte-runtime-test-'));
  const configPath = join(directory, 'runtime.json');
  await writeFile(configPath, JSON.stringify(config));
  // Fail tests if the production child tries an outbound network connection.
  const child = spawn(process.execPath, ['--import', fileURLToPath(new URL('./no-outbound.mjs', import.meta.url)),
    fileURLToPath(new URL(realEngine ? '../src/main.mjs' : './run-runtime.mjs', import.meta.url)), '--config', configPath], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TMPDIR: directory, ...(testArtifacts ? { PTE_TEST_ENGINE_ARTIFACTS: JSON.stringify(testArtifacts) } : {}) } });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exited = once(child, 'close').then(([code, signal]) => ({ code, signal }));
  const timeout = setTimeout(() => child.kill('SIGKILL'), 15000);
  context.after(async () => {
    clearTimeout(timeout);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited;
    await rm(directory, { recursive: true, force: true });
  });
  const ready = async () => {
    while (!stdout.includes('"event":"listener bound"')) {
      await Promise.race([once(child.stdout, 'data'), exited.then(() => { throw new Error(`Runtime exited before binding: ${stderr}`); })]);
    }
  };
  return { child, configPath, directory, exited, ready, output: () => ({ stdout, stderr }) };
}
