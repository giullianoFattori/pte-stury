import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createWhisperService } from '../runtime/src/whisper.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import { readFile } from 'node:fs/promises';
import { startRuntime } from '../runtime/src/server.mjs';
import { loadConfig } from '../runtime/src/config.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const vite = await createServer({ server: { port: 5177, strictPort: true } });
await vite.listen();
const base = 'http://127.0.0.1:5177';
const config = await loadConfig();
let runtime;
let inferenceStarted, inferenceFinished, inferenceAborted;
const start = async () => { runtime = await startRuntime(config, { initializeEngine: async options => {
 const real = await createWhisperService(options);
 return { async transcribeNormalizedAudio(input) {
  inferenceStarted = true; inferenceFinished = false; inferenceAborted = false;
  try { return await real.transcribeNormalizedAudio(input); }
  finally { inferenceFinished = true; inferenceAborted = input.signal.aborted; }
 } };
} }); await runtime.initialized; assert.equal(runtime.state.status, 'ready'); };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('pageerror', error => console.error('Browser test error:', error.message));
const remote = [], responses = [], requests = [];
page.on('request', req => { if (!req.url().startsWith(base) && !req.url().startsWith('blob:') && !req.url().startsWith('data:')) remote.push(req.url());
 if (req.url().endsWith('/api/v1/transcribe')) requests.push(req.postDataBuffer()?.toString('latin1')); });
page.on('response', async res => { if (res.url().endsWith('/api/v1/transcribe') && res.status() === 200) responses.push(await res.json()); });
async function waitText(text) { await page.getByText(text, { exact: true }).waitFor({ timeout: 20000 }); }
async function record(id) {
 const bytes = await readFile(root + 'tools/local-stt/tmp/controlled/' + id + '.wav');
 await page.route(base + '/controlled.wav', route => route.fulfill({ contentType: 'audio/wav', body: bytes }));
 await page.evaluate(async () => {
  const context = new AudioContext(); await context.resume();
  const buffer = await context.decodeAudioData(await (await fetch('/controlled.wav')).arrayBuffer());
  const destination = context.createMediaStreamDestination();
  navigator.mediaDevices.getUserMedia = async () => destination.stream;
  window.playControlled = async () => {
   const source = context.createBufferSource(); source.buffer = buffer; source.connect(destination);
   const ended = new Promise(resolve => source.onended = resolve); source.start(); await ended;
  };
 });
 await page.getByRole('button', { name: 'Enable microphone', exact: true }).click();
 await page.getByRole('button', { name: 'Start recording', exact: true }).click();
 await page.evaluate(() => window.playControlled());
 await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
 await waitText('Your recording is ready.');
}
try {
 await page.goto(base + '/study/read-aloud');
 await page.getByRole('button', { name: "I'm ready to read" }).click();
 assert.equal(await page.locator('.speech-transcription-panel select').count(), 0);
 await page.getByRole('button', { name: 'Check local runtime' }).click();
 await page.getByText('Start the PTE speech runtime', { exact: false }).waitFor();
 await record('RA-1'); // Recording works with runtime down.
 await page.getByRole('button', { name: 'Analyse audio locally' }).click();
 await page.getByText('Analysing…', { exact: true }).waitFor({ state: 'hidden' });
 await start();
 await page.getByRole('button', { name: 'Check local runtime' }).click();
 await waitText('Local Whisper transcription ready.');
 await runtime.close(); runtime = null;
 await page.getByRole('button', { name: 'Transcribe locally', exact: true }).click();
 await page.getByText('Start the PTE speech runtime', { exact: false }).waitFor();
 await waitText('Your recording is ready.');
 await start();
 await page.getByRole('button', { name: 'Check local runtime' }).click();
 await waitText('Local Whisper transcription ready.');
 await page.getByRole('button', { name: 'Transcribe locally', exact: true }).click();
 await waitText('Detected speech');
 await page.getByRole('heading', { name: 'Content result' }).waitFor();
 assert.match(await page.locator('.ra-content-result').innerText(), /Text accuracy: 100%/);
 console.log('RA native transcript + browser analysis, runtime-down recording, restart without reload and retry passed');
 // Reset after the real native inference call starts.
 inferenceStarted = false;
 await page.getByRole('button', { name: 'Transcribe locally', exact: true }).click();
 await waitText('Transcribing locally…');
 for (let count = 0; count < 200 && !inferenceStarted; count++) await page.waitForTimeout(20);
 assert.equal(inferenceStarted, true);
 assert.equal(inferenceFinished, false);
 await page.getByRole('button', { name: 'Record again', exact: true }).click();
 await page.getByText('Detected speech', { exact: true }).waitFor({ state: 'hidden' });
 await page.waitForTimeout(3000);
 assert.equal(await page.getByText('Detected speech', { exact: true }).count(), 0);
 assert.equal(inferenceFinished, true);
 assert.equal(inferenceAborted, true);
 console.log('Reset abort and no stale transcript passed');
 await page.goto(base + '/study/repeat-sentence');
 await page.getByRole('button', { name: 'Play sentence', exact: true }).click();
 await page.getByRole('button', { name: 'Replay sentence', exact: true }).waitFor();
 assert.equal(await page.getByText('Students must arrive before nine tomorrow.', { exact: true }).count(), 0);
 await record('RS-1');
 await page.getByRole('button', { name: 'Check local runtime' }).click();
 await waitText('Local Whisper transcription ready.');
 await page.getByRole('button', { name: 'Transcribe locally', exact: true }).click();
 await waitText('Detected speech');
 await page.getByRole('heading', { name: 'Content result' }).waitFor();
 assert.match(await page.locator('.rs-content-result').innerText(), /Chunk retention/);
 assert.equal(remote.length, 0);
 for (const body of requests) {
  assert.deepEqual([...body.matchAll(/; name="([^"]+)"/g)].map(match => match[1]), ['audio', 'language']);
 }
 console.log(JSON.stringify({ responses, remoteRequests: remote.length, submittedFields: ['audio', 'language'] }));
 // Independent hostile-origin check uses Node, since browser controls its Origin.
 const bad = await fetch(base + '/api/v1/health', { headers: { Origin: 'https://attacker.example' } });
 assert.equal(bad.status, 403);
 console.log('Proxy hostile Origin rejected; local browser requests pass strict runtime boundary');

 // Exercise the actual shared hook with controlled adapter promises under React.
 // The harness is a test-only fixture and is absent from normal app routes.
 await page.goto(base + '/tests/fixtures/speech-hook.html');
 const waitStatus = status => page.waitForFunction(value => window.hook?.status === value, status);
 await waitStatus('idle');
 await page.getByRole('button', { name: 'Check local runtime' }).click();
 await waitStatus('checking');
 await page.evaluate(() => window.resolveHealth('available'));
 await waitStatus('ready');
 await page.getByRole('button', { name: 'Transcribe locally' }).click();
 await waitStatus('transcribing');
 await page.evaluate(() => window.resolveTranscript({ text: 'Controlled success.', engine: 'whisper.cpp', language: 'en', processedLocally: true }));
 await waitStatus('success');
 await waitText('Detected speech');
 await page.getByRole('button', { name: 'Transcribe locally' }).click();
 await waitStatus('transcribing');
 await page.evaluate(() => window.rejectTranscript(new window.SpeechToTextError('recognition-failed', 'Controlled safe error.')));
 await waitStatus('error');
 await page.getByRole('button', { name: 'Try transcription again' }).click();
 await waitStatus('transcribing');
 await page.evaluate(() => window.rejectTranscript(new window.SpeechToTextError('audio-track-unavailable', 'The recording format is not supported.')));
 await waitStatus('error');
 assert.equal(await page.getByText('Start the PTE speech runtime', { exact: false }).count(), 0);
 await page.getByRole('button', { name: 'Try transcription again' }).click();
 await waitStatus('transcribing');
 await page.evaluate(() => { window.oldResolve = window.resolveTranscript; window.oldSignal = window.transcriptionSignal; window.hook.resetTranscription(); });
 await waitStatus('ready');
 assert.equal(await page.evaluate(() => window.oldSignal.aborted), true);
 await page.evaluate(() => window.oldResolve({ text: 'Stale transcript.', processedLocally: true }));
 await page.waitForTimeout(50);
 assert.equal(await page.evaluate(() => window.hook.result), null);
 await page.evaluate(() => { void window.hook.checkAvailability(); });
 await waitStatus('checking');
 await page.evaluate(() => { window.oldHealth = window.resolveHealth; window.oldHealthSignal = window.healthSignal; window.hook.resetTranscription(); });
 assert.equal(await page.evaluate(() => window.oldHealthSignal.aborted), true);
 await page.evaluate(() => window.oldHealth('unavailable'));
 await waitStatus('ready');
 await page.getByRole('button', { name: 'Transcribe locally' }).click();
 await waitStatus('transcribing');
 await page.evaluate(() => { window.oldResolve = window.resolveTranscript; window.oldSignal = window.transcriptionSignal; window.unmountHook(); window.mountHook('local-runtime'); });
 await waitStatus('idle');
 assert.equal(await page.evaluate(() => window.oldSignal.aborted), true);
 await page.evaluate(() => window.oldResolve({ text: 'Stale unmounted transcript.', processedLocally: true }));
 await page.waitForTimeout(50);
 assert.equal(await page.evaluate(() => window.hook.result), null);
 await page.evaluate(() => window.mountHook('browser-on-device'));
 await waitStatus('idle');
 assert.equal(await page.locator('.speech-transcription-panel select').count(), 1);
 await page.getByRole('button', { name: 'Check local availability' }).click();
 await waitStatus('needs-install');
 await page.getByRole('button', { name: 'Install local speech pack' }).click();
 await waitStatus('ready');
 await page.locator('.speech-transcription-panel select').selectOption('en-US');
 await waitStatus('idle');
 assert.equal(await page.evaluate(() => window.hook.language), 'en-US');
 console.log('React hook states, error retry, reset/check/unmount aborts, stale rejection, explicit browser language/install injection passed');

} finally { await browser.close(); await runtime?.close(); await vite.close(); }
