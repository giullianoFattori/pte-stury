import assert from 'node:assert/strict';
import { readFile, writeFile, unlink, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startFixture, post } from './fixture.mjs';
import { runNative } from '../../runtime/src/nativeProcess.mjs';
const cleanup = [];
const context = { after: callback => cleanup.push(callback) };
const results = [];
const command = async (path, args) => (await runNative(path, args, { signal: new AbortController().signal, timeoutMs: 1000,
  unavailable: () => new Error('Audit tool missing'), failed: () => new Error('Audit tool failed'), timeout: () => new Error('Audit tool timeout') })).toString('utf8');
try {
  const env = await startFixture(context, { inferenceTimeoutMs: 1000 });
  const listeners = await command('/usr/bin/ss', ['-ltn']);
  const own = listeners.split('\n').filter(line => line.includes(':' + env.config.port + ' '));
  assert.equal(own.length, 1); assert.ok(own[0].includes('127.0.0.1:' + env.config.port));
  for (const mode of ['abort', 'timeout']) {
    await unlink(join(env.base, 'pid')); await env.mode('hang');
    const controller = new AbortController();
    const pending = post(env, undefined, controller.signal).catch(error => error);
    let pid;
    for (let i = 0; i < 100; i++) {
      try { pid = Number(await readFile(join(env.base, 'pid'), 'utf8')); break; } catch { await delay(10); }
    }
    assert.ok(pid);
    const row = (await command('/usr/bin/ps', ['-o', 'pid=,ppid=,pgid=,stat=', '-p', String(pid)])).trim().split(/\s+/);
    assert.equal(Number(row[1]), process.pid); assert.equal(Number(row[2]), pid);
    if (mode === 'abort') controller.abort();
    const response = await pending;
    if (mode === 'timeout') assert.equal(response.status, 504);
    for (let i = 0; i < 100 && (await readdir(env.root)).some(name => name.startsWith('request-')); i++) await delay(10);
    assert.deepEqual(await readdir(env.root), ['instance.lock']);
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    await env.mode('ok'); assert.equal((await post(env)).status, 200);
    results.push({ mode, observedOwnedProcessGroup: true, nativeProcessAliveAfter: false, requestTempEntriesAfter: 0, recovered: true });
  }
  await writeFile(new URL('../../runtime/docs/audits/lifecycle-05.08.json', import.meta.url), JSON.stringify({ controlled: true,
    tools: ['ss -ltn', 'ps pid/ppid/pgid/stat'], listenerIpv4LoopbackOnly: true, results, passed: true }, null, 2) + '\n');
  console.log(JSON.stringify({ event: 'listener/process lifecycle audit passed' }));
} finally { for (const callback of cleanup.reverse()) await callback(); }
