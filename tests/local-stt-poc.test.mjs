import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { measureWordErrors, comparePocResponse } from '../src/infrastructure/speech/whisperPocEvaluation.ts';
import { createBridge } from '../tools/local-stt/scripts/bridge.mjs';
import { MAX_BYTES, withNormalizedAudio, inferWav } from '../tools/local-stt/scripts/audio.mjs';

function wav() {
  const bytes = Buffer.alloc(44 + 3200 * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(6400, 40);
  return bytes;
}
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

test('STT WER counts minimum word edits, allows >100%, and rejects empty reference', () => {
  assert.deepEqual(measureWordErrors('The cat sat', 'The dog sat'), {
    words: 3, S: 1, D: 0, I: 0, wer: 1 / 3, missingWords: [], insertions: [],
    substitutions: [{ expected: 'cat', actual: 'dog' }],
  });
  assert.equal(measureWordErrors('a b c', 'b c a').wer, 2 / 3);
  assert.equal(measureWordErrors('one', 'one two three').wer, 2);
  assert.equal(measureWordErrors('one two', '').D, 2);
  assert.equal(measureWordErrors('HELLO, world!', 'hello world').wer, 0);
  assert.throws(() => measureWordErrors('', 'speech'));
  assert.throws(() => measureWordErrors('a '.repeat(2001), 'speech'));
});

test('Whisper text flows through existing RA and RS metrics and chunk analysis', () => {
  assert.equal(comparePocResponse('ra', 'Students arrive tomorrow.', 'Students arrive tomorrow.').metrics.exactTextMatch, true);
  const rs = comparePocResponse('rs', 'Students arrive tomorrow.', 'Students arrive.', ['Students arrive', 'tomorrow']);
  assert.equal(rs.comparison.missingCount, 1);
  assert.equal(rs.metrics.totalErrors, 1);
  assert.equal(rs.chunks.retainedChunks, 1);
});

test('normalized temporary audio is deleted on success and inference failure', { skip: !hasFfmpeg }, async () => {
  let path;
  await withNormalizedAudio(wav(), ({ directory, duration, bytes }) => {
    path = directory;
    assert.ok(existsSync(directory));
    assert.equal(duration, 0.2);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  });
  assert.equal(existsSync(path), false);
  await assert.rejects(withNormalizedAudio(wav(), ({ directory }) => { path = directory; throw new Error('Inference failure'); }));
  assert.equal(existsSync(path), false);
  await assert.rejects(withNormalizedAudio(Buffer.from('Not audio'), () => assert.fail()), /Invalid/);
});

test('inference sends only fixed local WAV fields without answer prompts', async context => {
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:8765/inference');
    assert.deepEqual([...options.body.keys()], ['file', 'response_format', 'language', 'temperature']);
    assert.equal(options.body.get('file').name, 'recording.wav');
    return Response.json({ text: ' Test sentence. ' });
  });
  const result = await inferWav(wav());
  assert.equal(result.text, 'Test sentence.');
  assert.equal(result.processedLocally, true);
});

test('bridge rejects external origins, unsupported types, oversized requests and control routes', { skip: !hasFfmpeg }, async () => {
  const bridge = createBridge(async () => ({ text: 'Test', language: 'en', engine: 'whisper.cpp', processedLocally: true, inferenceSeconds: 0.01 }));
  bridge.listen(0, '127.0.0.1');
  await once(bridge, 'listening');
  const url = `http://127.0.0.1:${bridge.address().port}`;
  try {
    assert.equal((await fetch(`${url}/load`, { method: 'POST' })).status, 404);
    assert.equal((await fetch(`${url}/transcribe`, { method: 'POST', headers: { Origin: 'https://example.com', 'Content-Type': 'audio/wav' }, body: wav() })).status, 403);
    assert.equal((await fetch(`${url}/transcribe`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'command' })).status, 415);
    assert.equal((await fetch(`${url}/transcribe`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: Buffer.alloc(MAX_BYTES + 1) })).status, 413);
    const response = await fetch(`${url}/transcribe`, { method: 'POST', headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'audio/wav' }, body: wav() });
    assert.equal(response.status, 200);
    assert.ok(Math.abs((await response.json()).realTimeFactor - 0.05) < 1e-12);
  } finally { bridge.closeAllConnections(); await new Promise(resolve => bridge.close(resolve)); }
});
