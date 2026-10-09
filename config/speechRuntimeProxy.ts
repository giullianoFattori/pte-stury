import type { ProxyOptions } from 'vite';

// Trusted development transport only. Validate the incoming browser origin
// BEFORE rewriting headers for the runtime's exact loopback policy.
export function speechRuntimeProxy(): ProxyOptions {
  const target = 'http://127.0.0.1:8765';
  return {
    target, changeOrigin: true,
    bypass(req, res) {
      const counts = { host: 0, origin: 0 };
      for (let index = 0; index < req.rawHeaders.length; index += 2) {
        const name = req.rawHeaders[index].toLowerCase();
        if (name === 'host' || name === 'origin') counts[name]++;
      }
      const host = `127.0.0.1:${req.socket.localPort}`;
      const origin = req.headers.origin;
      const site = req.headers['sec-fetch-site'];
      if (counts.host !== 1 || counts.origin > 1 || req.headers.host !== host
        || (origin !== undefined && origin !== `http://${host}`)
        || (req.method === 'POST' && origin !== `http://${host}`)
        || (site !== undefined && site !== 'same-origin' && site !== 'none')
        || req.headers.upgrade !== undefined) {
        if (res) {
          res.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ error: { code: 'INVALID_REQUEST', message: 'Untrusted local runtime request.' } }));
        }
        return false;
      }
    },
    configure(proxy) {
      proxy.on('proxyReq', (outgoing, incoming) => {
        if (incoming.headers.origin !== undefined) outgoing.setHeader('Origin', target);
      });
      proxy.on('error', (_error, _req, res) => {
        if ('writeHead' in res && !res.headersSent && !res.writableEnded) {
          res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ error: { code: 'RUNTIME_UNAVAILABLE', message: 'The local speech runtime is unavailable.' } }));
        }
      });
    },
  };
}
