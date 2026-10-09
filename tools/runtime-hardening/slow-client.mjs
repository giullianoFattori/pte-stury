import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { once } from 'node:events';
import { readdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { makeFixture, post } from './fixture.mjs';
import { launch, assertLogs } from './processes.mjs';
const fixture = await makeFixture();
let runtime;
const results = [];
try {
  runtime = await launch(fixture);
  for (const mode of ['slow-headers', 'slow-body', 'stalled-chunked', 'half-open']) {
    const socket = connect(fixture.config.port, '127.0.0.1');
    socket.on('error', () => {}); socket.on('data', () => {});
    const closed = once(socket, 'close'), started = performance.now();
    await once(socket, 'connect');
    const prefix = `POST /api/v1/transcribe HTTP/1.1\r\nHost: 127.0.0.1:${fixture.config.port}\r\nOrigin: ${fixture.origin}\r\nContent-Type: multipart/form-data; boundary=hardening\r\n`;
    let drip;
    if (mode === 'slow-headers') { socket.write('GET /api/v1/health HTTP/1.1\r\nHost:'); drip = setInterval(() => socket.write(' '), 250); }
    if (mode === 'slow-body') { socket.write(prefix + 'Content-Length: 100000\r\n\r\n--hardening\r\n'); drip = setInterval(() => socket.write(' '), 250); }
    if (mode === 'stalled-chunked') socket.write(prefix + 'Transfer-Encoding: chunked\r\n\r\nD\r\n--hardening\r\n\r\n');
    const timer = setTimeout(() => socket.destroy(new Error('slow-client deadline exceeded')), 15000);
    await closed; clearTimeout(timer); clearInterval(drip);
    const elapsedMs = Math.round(performance.now() - started);
    assert.ok(elapsedMs < 14000, `${mode} must be bounded by production header/body/socket deadlines.`);
    await delay(50);
    assert.deepEqual(await readdir(fixture.root), ['instance.lock']);
    assert.equal((await post(fixture)).status, 200);
    results.push({ mode, elapsedMs, recovered: true, requestTempEntries: 0 });
    console.log(JSON.stringify({ event: 'slow client passed', ...results.at(-1) }));
  }
  assertLogs(runtime);
  await writeFile(new URL('../../runtime/docs/audits/slow-client-05.08.json', import.meta.url), JSON.stringify({ controlled: true,
    productionDeadlines: true, results, passed: true }, null, 2) + '\n');
} finally { await runtime?.stop(); await fixture.remove(); }
