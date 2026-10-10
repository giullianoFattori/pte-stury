import { open, lstat, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, extname } from 'node:path';
import { pipeline } from 'node:stream/promises';

export const PACKAGED_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.webm': 'audio/webm', '.ogg': 'audio/ogg' };
const identity = stat => [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':');

// Only manifest-owned files are served; no filesystem path comes from HTTP.
export async function createStaticServer(root, artifacts) {
  const canonicalRoot = await realpath(root);
  const files = new Map();
  for (const entry of artifacts.filter(entry => entry.kind === 'frontend')) {
    if (!entry.path.startsWith('web/')) throw new Error('Invalid frontend inventory');
    const url = '/' + entry.path.slice(4), path = resolve(canonicalRoot, entry.path.slice(4));
    if (await realpath(path) !== path || !MIME[extname(path)]) throw new Error('Invalid frontend file');
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== entry.size) throw new Error('Invalid frontend file');
    files.set(url, { path, identity: identity(stat), size: entry.size });
  }
  if (!files.has('/index.html')) throw new Error('Missing frontend entrypoint');
  return async (request, response) => {
    if (request.method !== 'GET' || request.headers['transfer-encoding'] !== undefined
      || (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0')) return false;
    const url = request.url;
    if (!/^\/[a-zA-Z0-9_./-]*$/.test(url) || url.startsWith('/api') || url.includes('//')
      || url.split('/').some(part => part === '.' || part === '..')) return false;
    const file = files.get(url === '/' ? '/index.html' : url)
      ?? (['/study', '/study/read-aloud', '/study/repeat-sentence', '/study/write-from-dictation', '/review', '/errors', '/settings'].includes(url) ? files.get('/index.html') : undefined);
    if (!file) return false;
    let handle;
    try {
      if (await realpath(file.path) !== file.path || identity(await lstat(file.path)) !== file.identity) throw new Error('Changed static artifact');
      handle = await open(file.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      if (identity(await handle.stat()) !== file.identity) throw new Error('Changed static artifact');
      response.writeHead(200, { 'Content-Type': MIME[extname(file.path)], 'Content-Length': file.size,
        'Cache-Control': /^\/assets\/[^/]+-[a-zA-Z0-9_-]{8,}\.(js|css)$/.test(url) ? 'public, max-age=31536000, immutable' : 'no-store',
        'Content-Security-Policy': PACKAGED_CSP, 'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'microphone=(self), camera=(), geolocation=()', 'Connection': 'close' });
      await pipeline(handle.createReadStream({ autoClose: false, start: 0, end: file.size - 1 }), response);
      return true;
    } finally { await handle?.close(); }
  };
}
