import assert from 'node:assert/strict';
import test from 'node:test';
import { request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { loadConfig } from '../runtime/src/config.mjs';
import { freePort, launchRuntime } from '../runtime/tests/helpers.mjs';
import { parseSpeechRuntimeHealth, parseSpeechRuntimeVersion, parseSpeechRuntimeErrorResponse,
  getSpeechRuntimeAvailability, SpeechRuntimeContractError } from '../src/domain/speech/runtimeTypes.ts';

function rawGet(port, headers, method = 'GET', path = '/api/v1/health') {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port, method, path, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: JSON.parse(Buffer.concat(chunks)) }));
    });
    request.on('error', reject);
    request.end();
  });
}

test('real runtime process returns health/version matching frontend contract without outbound networking', { timeout: 10000 }, async context => {
  const config = { ...await loadConfig(), port: await freePort(), model: 'small.en' };
  const runtime = await launchRuntime(config, context);
  await runtime.ready();
  assert.equal(runtime.child.exitCode, null);
  const url = `http://127.0.0.1:${config.port}`;
  const healthResponse = await fetch(`${url}/api/v1/health`);
  assert.equal(healthResponse.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(healthResponse.headers.get('cache-control'), 'no-store');
  const health = parseSpeechRuntimeHealth(await healthResponse.json());
  assert.equal(health.status, 'starting');
  assert.deepEqual(health.model, { id: 'small.en', loaded: false });
  assert.equal(health.processedLocally, true);
  assert.equal(getSpeechRuntimeAvailability(health), 'starting');
  const versionResponse = await fetch(`${url}/api/v1/version`);
  assert.equal(versionResponse.status, 200);
  assert.equal(versionResponse.headers.get('cache-control'), 'no-store');
  const version = parseSpeechRuntimeVersion(await versionResponse.json());
  assert.equal(version.runtimeVersion, '0.1.0');
  assert.equal(version.apiVersion, 1);
  assert.equal(version.engine, 'whisper.cpp');
  assert.equal(version.engineVersion, '1.8.3');
  assert.deepEqual(version.build, { platform: process.platform, arch: process.arch });
  for (const field of ['runtimeVersion', 'apiVersion', 'engine', 'engineVersion']) assert.equal(version[field], health[field]);
  const bodyText = JSON.stringify({ health, version });
  assert.doesNotMatch(bodyText, /\/home\/|\/tmp\/|ggml-|executablePath|modelPath|tempDir/);
  for (const change of [{ apiVersion: 2 }, { engine: 'other-engine' }]) {
    assert.throws(() => parseSpeechRuntimeHealth({ ...health, ...change }), error => error instanceof SpeechRuntimeContractError && error.code === 'RUNTIME_INCOMPATIBLE');
    assert.throws(() => parseSpeechRuntimeVersion({ ...version, ...change }), error => error instanceof SpeechRuntimeContractError && error.code === 'RUNTIME_INCOMPATIBLE');
  }
  assert.equal(runtime.output().stderr, '');
});

test('HTTP routing rejects unknown routes, methods, bodies, query inputs and upload expectations safely', async context => {
  const config = { ...await loadConfig(), port: await freePort() };
  const runtime = await launchRuntime(config, context);
  await runtime.ready();
  const host = `127.0.0.1:${config.port}`;
  for (const [method, path, status, headers] of [
    ['GET', '/api/v1/does-not-exist', 404, {}], ['POST', '/api/v1/transcribe', 400, {}],
    ['POST', '/api/v1/health', 405, {}], ['PUT', '/api/v1/version', 405, {}],
    ['GET', '/api/v1/health?answer=private-answer', 404, {}],
    ['GET', '/api/v1/health', 400, { 'Content-Length': '1' }],
    ['POST', '/api/v1/transcribe', 400, { Expect: '100-continue' }],
  ]) {
    const response = await rawGet(config.port, { Host: host, ...headers }, method, path);
    assert.equal(response.status, status);
    assert.equal(parseSpeechRuntimeErrorResponse(response.body).error.code, 'INVALID_REQUEST');
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.doesNotMatch(JSON.stringify(response.body), /private-answer|<html/);
    if (status === 405) assert.equal(response.headers.allow, 'GET');
  }
});

test('HTTP trust checks reject nonlocal Host/Origin, cross-site metadata and header-count bypasses', async context => {
  const config = { ...await loadConfig(), port: await freePort() };
  const runtime = await launchRuntime(config, context);
  await runtime.ready();
  const host = `127.0.0.1:${config.port}`;
  for (const headers of [
    { Host: 'attacker.example' }, { Host: `localhost:${config.port}` }, { Host: '127.0.0.1:1' },
    { Host: host, Origin: 'https://example.com' }, { Host: host, Origin: 'null' },
    { Host: host, Origin: 'http://127.0.0.1:5173' }, { Host: host, 'Sec-Fetch-Site': 'cross-site' },
    { Host: host, ...Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`x-extra-${i}`, 'test'])), Origin: 'https://example.com' },
  ]) {
    const response = await rawGet(config.port, headers);
    assert.equal(response.status, 400);
    assert.equal(parseSpeechRuntimeErrorResponse(response.body).error.code, 'INVALID_REQUEST');
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  }
  const allowed = await rawGet(config.port, { Host: host, Origin: `http://${host}`, 'Sec-Fetch-Site': 'same-origin' });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers['access-control-allow-origin'], undefined);
});

test('malformed HTTP is rejected with typed JSON instead of parser exceptions or HTML', async context => {
  const config = { ...await loadConfig(), port: await freePort() };
  const runtime = await launchRuntime(config, context);
  await runtime.ready();
  const response = await new Promise((resolve, reject) => {
    const socket = connect(config.port, '127.0.0.1');
    let text = '';
    socket.on('error', reject);
    socket.on('data', chunk => { text += chunk; });
    socket.on('end', () => resolve(text));
    socket.on('connect', () => socket.write('GET /api/v1/health HTTP/1.1\r\nBad Header: invalid\r\n\r\n'));
  });
  assert.match(response, /^HTTP\/1.1 400/);
  assert.equal(parseSpeechRuntimeErrorResponse(JSON.parse(response.split('\r\n\r\n')[1])).error.code, 'INVALID_REQUEST');
});
