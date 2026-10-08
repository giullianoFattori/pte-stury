import { createServer } from 'node:http';
import { validateConfig } from './config.mjs';
import { createRuntimeState, healthResponse } from './health.mjs';
import { versionResponse } from './version.mjs';
import { RuntimeStartupError, errorBody, sendJson, rejectSocket } from './errors.mjs';

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

export async function startRuntime(input) {
  const config = validateConfig(input);
  const state = createRuntimeState(config);
  const sockets = new Set();
  const server = createServer({ maxHeaderSize: 8192, headersTimeout: 5000, requestTimeout: 10000, keepAliveTimeout: 1000, connectionsCheckingInterval: 1000 }, (request, response) => {
    // No request stream is consumed or buffered by the metadata shell.
    try {
      if (!trustedRequest(request, config)) {
        sendJson(response, 400, errorBody('INVALID_REQUEST', 'The runtime request origin or host is not allowed.')); return;
      }
      const route = request.url === '/api/v1/health' ? healthResponse : request.url === '/api/v1/version' ? versionResponse : null;
      if (!route) { sendJson(response, 404, errorBody('INVALID_REQUEST', 'The requested runtime route does not exist.')); return; }
      if (request.method !== 'GET') {
        sendJson(response, 405, errorBody('INVALID_REQUEST', 'The requested runtime method is not allowed.'), { Allow: 'GET' }); return;
      }
      if (request.headers['transfer-encoding'] !== undefined || (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0')) {
        sendJson(response, 400, errorBody('INVALID_REQUEST', 'Runtime metadata requests must not contain a body.')); return;
      }
      sendJson(response, 200, route(state));
    } catch { sendJson(response, 500, errorBody('INTERNAL_ERROR', 'The runtime request could not be handled.')); }
  });
  // Node truncates parsed headers at maxHeadersCount. Preserve headers for our
  // rejection checks, with the independent 8 KiB parser limit and 32-field gate.
  server.maxHeadersCount = 0;
  server.setTimeout(10000, socket => socket.destroy());
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  server.on('clientError', (_error, socket) => rejectSocket(socket));
  server.on('checkContinue', (_request, response) => sendJson(response, 400, errorBody('INVALID_REQUEST', 'Runtime uploads are not supported.')));
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
  let closing;
  function close() {
    if (closing) return closing;
    closing = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { for (const socket of sockets) socket.destroy(); }, 2000);
      timer.unref();
      server.close(error => { clearTimeout(timer); if (error) reject(error); else resolve(); });
      server.closeIdleConnections();
    });
    return closing;
  }
  return { server, state, close };
}
