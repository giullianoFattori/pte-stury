import { spawn } from 'node:child_process';

export const NATIVE_OUTPUT_LIMIT = 65536;
// No inherited loader, Node, proxy, model/path, or tool-specific overrides.
// Windows needs its trusted OS directory; packaging must sanitize launcher env too.
export function nativeEnvironment() {
  return { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8',
    ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {}) };
}

export async function runNative(executable, args, { signal, timeoutMs, unavailable, failed, timeout, onSpawn }) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const grouped = process.platform !== 'win32';
    const child = spawn(executable, args, { shell: false, detached: grouped,
      env: nativeEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] });
    onSpawn?.(child.pid);
    let stdoutBytes = 0, stderrBytes = 0, failure, hardKill;
    const chunks = [];
    const kill = signalName => {
      try {
        if (grouped && child.pid) process.kill(-child.pid, signalName);
        else child.kill(signalName);
      } catch (error) { if (error.code !== 'ESRCH') child.kill('SIGKILL'); }
    };
    const stop = error => {
      if (failure) return;
      failure = error;
      kill('SIGTERM');
      hardKill = setTimeout(() => kill('SIGKILL'), 100);
    };
    const abort = () => stop(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const timer = setTimeout(() => stop(timeout()), timeoutMs);
    child.stdout.on('data', chunk => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > NATIVE_OUTPUT_LIMIT) stop(failed()); else chunks.push(chunk);
    });
    child.stderr.on('data', chunk => { stderrBytes += chunk.length; if (stderrBytes > NATIVE_OUTPUT_LIMIT) stop(failed()); });
    child.on('error', error => { failure ??= ['ENOENT', 'EACCES', 'ENOEXEC'].includes(error.code) ? unavailable() : failed(); });
    child.once('close', code => {
      clearTimeout(timer); clearTimeout(hardKill); signal.removeEventListener('abort', abort);
      // A direct child can exit while descendants have closed their pipes and
      // remain alive. Close the owned POSIX process group before resolving.
      if (grouped && child.pid) kill('SIGKILL');
      if (failure || code !== 0) reject(failure ?? failed()); else resolve(Buffer.concat(chunks));
    });
  });
}
