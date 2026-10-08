import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { MAX_BYTES, audioTypes, PocError, withNormalizedAudio, inferWav } from './audio.mjs';

export function createBridge(infer = inferWav) {
  let busy = false;
  return createServer(async (request, response) => {
    const reply = (status, body) => {
      if (!response.destroyed) {
        response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        response.end(JSON.stringify(body));
      }
    };
    const remote = request.socket.remoteAddress;
    const origin = request.headers.origin;
    if (remote !== '127.0.0.1' || (origin && !/^http:\/\/(127\.0\.0\.1|localhost):5173$/.test(origin))
      || !/^127\.0\.0\.1:\d+$/.test(request.headers.host ?? '')) {
      request.resume(); reply(403, { error: 'Loopback development origin required.' }); return;
    }
    if (request.method !== 'POST' || request.url !== '/transcribe') {
      request.resume(); reply(404, { error: 'Unknown endpoint.' }); return;
    }
    if (!audioTypes.has((request.headers['content-type'] ?? '').split(';')[0])) {
      request.resume(); reply(415, { error: 'Unsupported audio content type.' }); return;
    }
    if (Number(request.headers['content-length']) > MAX_BYTES) {
      request.resume(); reply(413, { error: 'Audio exceeds 12 MiB.' }); return;
    }
    if (busy) { request.resume(); reply(429, { error: 'Another transcription is running.' }); return; }
    busy = true;
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); request.destroy(); }, 210000);
    response.on('close', () => { if (!response.writableEnded) controller.abort(); });
    const started = performance.now();
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > MAX_BYTES) { reply(413, { error: 'Audio exceeds 12 MiB.' }); request.destroy(); return; }
        chunks.push(chunk);
      }
      const result = await withNormalizedAudio(Buffer.concat(chunks), async ({ bytes, duration }) => {
        const transcript = await infer(bytes, controller.signal);
        return { ...transcript, audioSeconds: duration, realTimeFactor: transcript.inferenceSeconds / duration };
      }, controller.signal);
      reply(200, { ...result, totalSeconds: (performance.now() - started) / 1000 });
    } catch (error) {
      reply(error instanceof PocError ? error.status : 502, { error: error instanceof PocError ? error.message : 'Local transcription failed. Check ffmpeg and whisper-server.' });
    } finally {
      clearTimeout(timer);
      busy = false;
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createBridge();
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.listen(8766, '127.0.0.1', () => console.log('POC audio bridge: http://127.0.0.1:8766 (no audio logs)'));
  // Closing connections aborts active requests, allowing their finally blocks to delete audio.
  const shutdown = () => { server.close(); server.closeAllConnections(); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
