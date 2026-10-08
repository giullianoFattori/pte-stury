import { createServer } from 'node:http';
import { validateConfig } from './config.mjs';
import { createRuntimeState, healthResponse } from './health.mjs';
import { versionResponse } from './version.mjs';
import { RuntimeStartupError, AudioRequestError, errorBody, sendJson, rejectSocket } from './errors.mjs';

import { createTempStore } from './temp.mjs';
import { createTranscriptionGate } from './transcriptionGate.mjs';
import { processAudioRequest } from './audioRequest.mjs';

function trustedRequest(request, config) {
  const expectedHost = `127.0.0.1:${config.port}`;
  if (request.rawHeaders.length > 64) return false;
  const counts = { host: 0, origin: 0 };
  for (let i = 0; i < request.rawHeaders.length; i += 2) {
    const name = request.rawHeaders[i].toLowerCase();
    if (Object.hasOwn(counts, name)) counts[name]++;
  }
  return request.socket.remoteAddress === '127.0.0.1' && counts.host === 1 && counts.origin <= 1
    && request.headers.host === expectedHost
    && (request.headers.origin === undefined || request.headers.origin === `http://${expectedHost}`)
    && (request.headers['sec-fetch-site'] === undefined || ['same-origin', 'none'].includes(request.headers['sec-fetch-site']));
}

export async function startRuntime(input, options = {}) {
  const config = validateConfig(input);
  const state = createRuntimeState(config);
  const sockets = new Set();
  const pending = new Set();
  const services = { gate: createTranscriptionGate(), controllers: new Set(), ...options };
  let stopping = false;
  let initialized;
  const initialization = new Promise(resolve => { initialized = resolve; });
  const server = createServer({ maxHeaderSize: 8192, headersTimeout: 5000, requestTimeout: 10000, keepAliveTimeout: 1000, connectionsCheckingInterval: 1000 }, (request, response) => {
    const task = handle(request, response);
    pending.add(task);
    void task.finally(() => pending.delete(task));
  });
  async function handle(request, response) {
    try {
      if (!trustedRequest(request, config)) {
        sendJson(response, 400, errorBody('INVALID_REQUEST', 'The runtime request origin or host is not allowed.')); return;
      }
      if (request.url === '/api/v1/transcribe') {
        if (request.method !== 'POST') {
          sendJson(response, 405, errorBody('INVALID_REQUEST', 'The requested runtime method is not allowed.'), { Allow: 'POST' }); return;
        }
        if (request.headers.origin !== `http://127.0.0.1:${config.port}`) {
          sendJson(response, 400, errorBody('INVALID_REQUEST', 'The audio request requires the trusted local origin.')); return;
        }
        await initialization;
        if (stopping || services.cleanupFailed || !services.temp) throw new AudioRequestError(503, 'RUNTIME_STARTING', 'Runtime audio ingestion is unavailable.');
        await processAudioRequest(request, response, config, services);
        return;
      }
      const route = request.url === '/api/v1/health' ? healthResponse : request.url === '/api/v1/version' ? versionResponse : null;
      if (!route) { sendJson(response, 404, errorBody('INVALID_REQUEST', 'The requested runtime route does not exist.')); return; }
      if (request.method !== 'GET') {
        sendJson(response, 405, errorBody('INVALID_REQUEST', 'The requested runtime method is not allowed.'), { Allow: 'GET' }); return;
      }
      if (request.headers['transfer-encoding'] !== undefined || (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0')) {
        sendJson(response, 400, errorBody('INVALID_REQUEST', 'Runtime metadata requests must not contain a body.')); return;
      }
      sendJson(response, 200, route(services.cleanupFailed ? { ...state, status: 'error' } : state));
    } catch (error) {
      request.pause();
      if (!response.destroyed && !response.headersSent) {
        const safe = error instanceof AudioRequestError ? error : new AudioRequestError(500, 'INTERNAL_ERROR', 'The runtime request could not be handled.');
        sendJson(response, safe.status, errorBody(safe.code, safe.message));
      }
    }
  }
  // Node truncates parsed headers at maxHeadersCount. Preserve headers for our
  // rejection checks, with the independent 8 KiB parser limit and 32-field gate.
  server.maxHeadersCount = 0;
  server.setTimeout(65000, socket => socket.destroy());
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  server.on('clientError', (_error, socket) => rejectSocket(socket));
  server.on('checkContinue', (_request, response) => sendJson(response, 400, errorBody('INVALID_REQUEST', 'Upload expectations are not supported; send the request without Expect.')));
  server.on('checkExpectation', (_request, response) => sendJson(response, 417, errorBody('INVALID_REQUEST', 'The runtime request expectation is not supported.')));
  server.on('upgrade', (_request, socket) => rejectSocket(socket, 404, 'The requested runtime route does not exist.'));
  server.on('connect', (_request, socket) => rejectSocket(socket, 404, 'The requested runtime route does not exist.'));
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port, config.host, () => { server.removeListener('error', reject); resolve(); });
    });
  } catch (error) {
    throw new RuntimeStartupError(error.code === 'EADDRINUSE' ? 'PORT_IN_USE' : 'LISTEN_FAILED',
      error.code === 'EADDRINUSE' ? 'Runtime port is already in use.' : 'Runtime loopback listener could not start.');
  }
  try { services.temp = await createTempStore(config.port, options.tempBase); initialized(); } catch {
    stopping = true; initialized();
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
    throw new RuntimeStartupError('TEMP_STORAGE_FAILED', 'Runtime temporary storage could not initialize.');
  }
  let closing;
  function close() {
    if (closing) return closing;
    stopping = true;
    for (const controller of services.controllers) controller.abort(new AudioRequestError(499, 'REQUEST_CANCELLED', 'The runtime is shutting down.'));
    const listenerClosed = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { for (const socket of sockets) socket.destroy(); }, 2000);
      timer.unref();
      server.close(error => { clearTimeout(timer); if (error) reject(error); else resolve(); });
      server.closeIdleConnections();
    });
    closing = Promise.all([listenerClosed, ...pending]).then(() => services.temp.close());
    return closing;
  }
  return { server, state, close };
}
