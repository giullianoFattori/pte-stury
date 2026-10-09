import { spawn } from 'node:child_process';
import { readFile, readdir, readlink } from 'node:fs/promises';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { nativeEnvironment } from '../../runtime/src/nativeProcess.mjs';

export async function launch(fixture, mode) {
  const child = spawn(process.execPath, ['--expose-gc', '--import', fileURLToPath(new URL('../../runtime/tests/no-outbound.mjs', import.meta.url)),
    fileURLToPath(new URL('./stress-child.mjs', import.meta.url)), fixture.base, ...(mode ? [mode] : [])],
    { shell: false, env: nativeEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', diagnostics = '';
  child.stdout.on('data', bytes => { output += bytes; if (output.length > 65536) child.kill('SIGKILL'); });
  child.stderr.on('data', bytes => { diagnostics += bytes; if (diagnostics.length > 65536) child.kill('SIGKILL'); });
  const exited = once(child, 'close').then(([code, signal]) => ({ code, signal }));
  const stop = async () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); return exited; };
  if (!mode) {
    try {
      for (let i = 0; i < 500; i++) {
        if (child.exitCode !== null || child.signalCode !== null) throw new Error('Stress child exited before ready.');
        try { if ((await (await fetch(fixture.origin + '/api/v1/health', { signal: AbortSignal.timeout(500) })).json()).status === 'ready') return { child, exited, stop, output: () => ({ output, diagnostics }) }; } catch { /* startup */ }
        await delay(10);
      }
      throw new Error('Stress startup deadline exceeded.');
    } catch (error) { await stop(); throw error; }
  }
  return { child, exited, stop, output: () => ({ output, diagnostics }) };
}
export async function snapshot(pid) {
  const status = await readFile(`/proc/${pid}/status`, 'utf8');
  const fds = await readdir(`/proc/${pid}/fd`);
  const targets = await Promise.all(fds.map(fd => readlink(`/proc/${pid}/fd/${fd}`).catch(() => 'closed')));
  const children = (await readFile(`/proc/${pid}/task/${pid}/children`, 'utf8')).trim();
  return { rssBytes: Number(/^VmRSS:\s+(\d+) kB/m.exec(status)[1]) * 1024, fdCount: fds.length,
    sockets: targets.filter(value => value.startsWith('socket:')).length, pipes: targets.filter(value => value.startsWith('pipe:')).length,
    childCount: children ? children.split(/\s+/).length : 0 };
}
export function assertLogs(runtime) {
  const { output, diagnostics } = runtime.output();
  assert.equal(diagnostics, '');
  assert.doesNotMatch(output, /Controlled local transcript|private.wav|\/tmp\/|\/home\/|stderr|normalized.wav/);
  for (const line of output.trim().split('\n')) assert.equal(typeof JSON.parse(line).event, 'string');
}
