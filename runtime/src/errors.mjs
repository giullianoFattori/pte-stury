export class RuntimeStartupError extends Error {
  constructor(code, message) { super(message); this.name = 'RuntimeStartupError'; this.code = code; }
}

export class AudioRequestError extends Error {
  constructor(status, code, message) { super(message); this.name = 'AudioRequestError'; this.status = status; this.code = code; }
}

export function invalidAudioRequest() {
  return new AudioRequestError(400, 'INVALID_REQUEST', 'The audio request is invalid.');
}

export function errorBody(code, message) { return { error: { code, message } }; }

export function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', Connection: 'close', ...headers,
  });
  response.end(JSON.stringify(body));
}

export function rejectSocket(socket, status = 400, message = 'The runtime request is invalid.') {
  if (!socket.writable || socket.destroyed) return;
  const body = JSON.stringify(errorBody('INVALID_REQUEST', message));
  socket.end(`HTTP/1.1 ${status} ${status === 404 ? 'Not Found' : 'Bad Request'}\r\nContent-Type: application/json; charset=utf-8\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}
