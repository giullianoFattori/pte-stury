import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer } from 'vite';
import { speechRuntimeProxy } from '../config/speechRuntimeProxy.ts';

test('development proxy validates browser trust before rewriting and reports backend outage safely', async context => {
  const received = [];
  const backend = http.createServer((req, res) => {
    received.push({ headers: req.headers, url: req.url });
    req.resume();
    res.setHeader('Content-Type', 'application/json');
    res.end('{}');
  });
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  const backendPort = backend.address().port;
  // Test-owned target only; application config always uses the fixed runtime.
  const proxy = { ...speechRuntimeProxy(), target: `http://127.0.0.1:${backendPort}` };
  const vite = await createServer({ configFile: false, logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, proxy: { '^/api/v1(?:/|$)': proxy } } });
  context.after(async () => { await vite.close(); if (backend.listening) await new Promise(resolve => backend.close(resolve)); });
  await vite.listen();
  const port = vite.httpServer.address().port;
  const origin = `http://127.0.0.1:${port}`;
  const rawStatus = headers => new Promise((resolve, reject) => {
    const req = http.get(origin + '/api/v1/health', { headers, servername: '' }, res => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
  });
  for (const headers of [
    { Origin: 'https://evil.example' }, { Origin: 'null' },
    { Host: 'evil.example' }, { Host: [`127.0.0.1:${port}`, 'evil.example'] },
    { Origin: [origin, origin] }, { Origin: origin, 'Sec-Fetch-Site': 'cross-site' },
  ]) assert.equal(await rawStatus(headers), 403, JSON.stringify(headers));
  assert.equal((await fetch(origin + '/api/v1/transcribe', { method: 'POST' })).status, 403);
  assert.equal(received.length, 0);
  const response = await fetch(origin + '/api/v1/transcribe', {
    method: 'POST', headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin' }, body: 'controlled',
  });
  assert.equal(response.status, 200);
  assert.equal(received[0].headers.host, `127.0.0.1:${backendPort}`);
  assert.equal(received[0].headers.origin, 'http://127.0.0.1:8765');
  assert.equal(received[0].url, '/api/v1/transcribe');
  await new Promise(resolve => backend.close(resolve));
  const down = await fetch(origin + '/api/v1/health');
  assert.equal(down.status, 503);
  assert.equal((await down.json()).error.code, 'RUNTIME_UNAVAILABLE');
});
