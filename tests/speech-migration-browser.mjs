// Optional real-browser integration. Default mocks runtime HTTP; --real uses the
// existing pinned engine with controlled TTS recordings, never a learner benchmark.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRuntime } from '../runtime/src/server.mjs';
import { writeFromDictationQuestions } from '../src/data/question-bank/write-from-dictation.ts';
import { loadConfig } from '../runtime/src/config.mjs';
import { readAloudQuestions } from '../src/data/question-bank/read-aloud.ts';
import { repeatSentenceQuestions } from '../src/data/question-bank/repeat-sentence.ts';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const real = process.argv.includes('--real');
const root = fileURLToPath(new URL('../', import.meta.url));
const port = real ? 5180 : 5179;
const vite = await createServer({ cacheDir: 'node_modules/.vite-migration-' + (real ? 'real' : 'mock'),
  server: { port, strictPort: true } });
await vite.listen();
const origin = 'http://127.0.0.1:' + port;
let runtime;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const pageErrors = [], outbound = [], observations = [], submittedFields = [];
page.on('pageerror', error => pageErrors.push(error.message));
page.on('request', request => {
  if (request.url().endsWith('/api/v1/transcribe')) {
    const fields = [...request.postDataBuffer().toString('latin1').matchAll(/; name="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(fields, ['audio', 'language']); submittedFields.push(fields);
  }
  const url = new URL(request.url());
  if (['http:', 'https:'].includes(url.protocol) && url.hostname !== '127.0.0.1') outbound.push(request.url());
});
await page.addInitScript(() => {
  window.browserSttCalls = 0;
  class ForbiddenBrowserRecognizer {
    constructor() { window.browserSttCalls++; throw new Error('Normal learner path called browser STT'); }
    static available() { window.browserSttCalls++; throw new Error('Browser language-pack availability used'); }
    static install() { window.browserSttCalls++; throw new Error('Browser install used'); }
  }
  window.SpeechRecognition = ForbiddenBrowserRecognizer;
  window.webkitSpeechRecognition = ForbiddenBrowserRecognizer;
});
let mode = 'success', transcript = '', held, releaseHeld;
const metadata = { runtimeVersion: '0.1.0', apiVersion: 1, engine: 'whisper.cpp', engineVersion: '1.8.3',
  model: { id: 'base.en', loaded: true }, processedLocally: true, status: 'ready' };
const wire = text => ({ text, language: 'en', engine: 'whisper.cpp', model: 'base.en', processedLocally: true,
  timing: { audioMs: 6000, inferenceMs: 100, totalMs: 140 } });
if (!real) {
  await page.route('**/api/v1/health', route => route.fulfill({ json: metadata }));
  await page.route('**/api/v1/transcribe', async route => {
    const body = route.request().postDataBuffer().toString('latin1');
    assert.deepEqual([...body.matchAll(/; name="([^"]+)"/g)].map(match => match[1]), ['audio', 'language']);
    assert.match(body, /Content-Type: audio\/webm/i);
    assert.match(body, /name="language"\r\n\r\nen\r\n/);
    const captured = transcript;
    if (mode === 'hold') {
      held = true;
      await new Promise(resolve => { releaseHeld = resolve; });
      try { await route.fulfill({ json: wire(captured) }); } catch { /* client already aborted */ }
      return;
    }
    const errors = { busy: [429, 'RUNTIME_BUSY'], timeout: [504, 'INFERENCE_TIMEOUT'],
      silence: [422, 'NO_SPEECH'], unsupported: [415, 'AUDIO_UNSUPPORTED'] };
    if (mode in errors) {
      const [status, code] = errors[mode];
      return route.fulfill({ status, json: { error: { code, message: '/private/native stderr' } } });
    }
    return route.fulfill({ json: wire(captured) });
  });
}
const button = name => page.getByRole('button', { name, exact: true });
const text = value => page.getByText(value, { exact: true });
async function snapshot() {
  return page.evaluate(async () => {
    const { db } = await import('/src/data/db/database.ts');
    return { attempts: await db.attempts.toArray(), errors: await db.errors.toArray(), reviews: await db.reviews.toArray() };
  });
}
async function record(fixture, ra) {
  if (await button('Disable microphone').count()) await button('Disable microphone').click();
  await page.unroute(origin + '/controlled.wav');
  await page.route(origin + '/controlled.wav', route => readFile(root + 'tools/local-stt/tmp/controlled/' + fixture + '.wav')
    .then(bytes => route.fulfill({ body: bytes, contentType: 'audio/wav' })));
  await page.evaluate(async () => {
    window.controlledContext?.close();
    const context = new AudioContext(); await context.resume();
    window.controlledContext = context;
    const buffer = await context.decodeAudioData(await (await fetch('/controlled.wav')).arrayBuffer());
    const destination = context.createMediaStreamDestination();
    navigator.mediaDevices.getUserMedia = async () => destination.stream;
    window.playControlled = () => {
      const source = context.createBufferSource(); source.buffer = buffer; source.connect(destination);
      const ended = new Promise(resolve => { source.onended = resolve; }); source.start(); return ended;
    };
  });
  if (ra && await button("I'm ready to read").count()) await button("I'm ready to read").click();
  await button('Enable microphone').click();
  if (!ra) {
    await button(await button('Play sentence').count() ? 'Play sentence' : 'Replay sentence').click();
    await page.waitForFunction(() => document.querySelector('.rs-source-audio audio')?.paused === false);
    assert.equal(await button('Start recording').isDisabled(), true);
    await button('Replay sentence').waitFor();
  }
  await button('Start recording').click();
  await page.evaluate(() => window.playControlled());
  await button('Stop recording').click();
  await text('Your recording is ready.').waitFor();
  await page.evaluate(async () => {
    const audio = document.querySelector('audio[aria-label="Your recording"]');
    const ended = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Recorded playback did not end')), 25000);
      audio.onended = () => { clearTimeout(timer); resolve(); };
      audio.onerror = () => { clearTimeout(timer); reject(new Error('Recorded playback failed')); };
    });
    await audio.play(); await ended;
  });
}
async function transcribe() {
  if (await button('Check local runtime').count()) await button('Check local runtime').click();
  await text('Local Whisper transcription ready.').waitFor();
  const response = page.waitForResponse(res => res.url().endsWith('/api/v1/transcribe'));
  await button('Transcribe locally').click();
  const result = await response;
  assert.equal(result.status(), 200);
  await text('Detected speech').waitFor();
  return result.json();
}
async function analyse() {
  await button('Analyse audio locally').click();
  await page.getByRole('heading', { name: 'Fluency timing' }).waitFor();
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].some(el => el.textContent === 'Analysing…'));
  for (const label of ['Response latency', 'Ending silence', 'Active reading', 'Speech', 'Pauses', 'Long pauses', 'Speech ratio', 'Speech rate']) {
    assert.ok((await page.locator('.ra-fluency-result').innerText()).includes(label), label);
  }
}
async function saveOnce() {
  await button('Save attempt').evaluate(element => { element.click(); element.click(); });
  await text('Attempt saved locally.').waitFor();
  assert.equal(await button('Attempt saved').isDisabled(), true);
}
function validateOutcome(state, previousCount, item, raw, ra) {
  assert.equal(state.attempts.length, previousCount + 1);
  const attempt = state.attempts.find(a => a.itemId === item.id && a.responseText === raw.text);
  assert.ok(attempt);
  assert.equal(attempt.taskType, ra ? 'read-aloud' : 'repeat-sentence');
  assert.equal(attempt.metrics.processedLocally, true);
  assert.equal('sttConfidence' in attempt.metrics, false);
  assert.equal(attempt.score, attempt.metrics[ra ? 'textCoverage' : 'contentRecall']);
  const errors = state.errors.filter(e => e.attemptId === attempt.id);
  assert.equal(errors.length, attempt.metrics.totalErrors);
  for (const error of errors) {
    assert.ok(['omission', 'insertion', 'substitution'].includes(error.category));
    assert.deepEqual(error.skills, ra ? ['reading', 'speaking'] : ['listening', 'speaking']);
    assert.equal(error.itemId, item.id);
  }
  const reviews = state.reviews.filter(r => r.sourceAttemptId === attempt.id);
  assert.equal(reviews.length, errors.length ? 1 : 0);
  if (reviews.length) { assert.equal(reviews[0].type, 'sentence'); assert.equal(reviews[0].answer, item.transcript); }
  if (ra) {
    for (const field of ['responseLatencyMs', 'endingSilenceMs', 'activeWindowMs', 'speechDurationMs',
      'interiorPauseDurationMs', 'pauseCount', 'longPauseCount', 'speechRatio', 'speechRateWpm']) {
      assert.equal(typeof attempt.metrics[field], 'number'); assert.ok(Number.isFinite(attempt.metrics[field]));
    }
  } else { assert.equal(attempt.metrics.totalChunks, item.chunks.length); }
  return { attempt, errors, reviews };
}
try {
  if (real) {
    runtime = await startRuntime(await loadConfig()); await runtime.initialized;
    const health = await (await fetch('http://127.0.0.1:8765/api/v1/health')).json();
    assert.equal(health.status, 'ready'); assert.equal(health.model.loaded, true);
    assert.equal(health.engine, 'whisper.cpp'); assert.equal(health.processedLocally, true);
  }
  for (const ra of [true, false]) {
    await page.goto(origin + (ra ? '/study/read-aloud' : '/study/repeat-sentence'));
    const items = ra ? readAloudQuestions : repeatSentenceQuestions;
    const cases = ra ? [[0, 'RA-1'], [2, 'RA-M'], [5, 'RA-3']] : [[0, 'RS-1'], [2, 'RS-2'], [4, 'RS-3']];
    let current = 0;
    for (const [index, fixture] of cases) {
      while (current < index) { await button(ra ? 'Next passage' : 'Next question').click(); current++; }
      await text('Question ' + (index + 1) + ' of ' + items.length).waitFor();
      const item = items[index];
      assert.equal(await page.locator('.speech-transcription-panel select').count(), 0);
      assert.doesNotMatch(await page.locator('.speech-transcription-panel').innerText(), /en-AU|en-US|speech pack|browser does not support/);
      if (ra) {
        assert.equal(await button('Start recording').isDisabled(), true);
        await page.getByLabel('Show phrasing help').check();
        await page.getByLabel('Show stress targets').check();
        assert.ok(await page.locator('.ra-stress-word').count());
        assert.match(await page.locator('.ra-training-passage').innerText(), /\//);
      } else assert.equal((await page.locator('body').innerText()).includes(item.transcript), false);
      await record(fixture, ra);
      const before = await snapshot();
      transcript = !real && index === 0
        ? (ra ? 'Many students really use private transport to travel to university each day because it is convenient.'
          : 'Students really must leave before tomorrow.') : item.transcript;
      const raw = await transcribe();
      if (real) {
        const temp = join(tmpdir(), 'pte-study-runtime-' + (process.getuid?.() ?? 'user'), 'port-8765');
        assert.deepEqual((await readdir(temp)).filter(name => name.startsWith('request-')), []);
      }
      assert.equal(raw.engine, 'whisper.cpp'); assert.equal(raw.model, 'base.en'); assert.equal(raw.processedLocally, true);
      assert.equal((await snapshot()).attempts.length, before.attempts.length); // No auto-save.
      if (ra) {
        assert.equal(await button('Save attempt').isDisabled(), true);
        await analyse(); assert.equal(await button('Save attempt').isDisabled(), false);
      }
      if (!real && index === 0) {
        // Fail while inserting an ErrorRecord after Attempt.add; Dexie must roll back all stores.
        await page.evaluate(async () => {
          const { db } = await import('/src/data/db/database.ts');
          window.failureHook = () => { throw new Error('Injected transaction failure'); };
          db.errors.hook('creating', window.failureHook);
        });
        await button('Save attempt').click();
        await page.getByText(ra ? 'Your Read Aloud attempt could not be saved. Please try again.' :
          'Your Repeat Sentence attempt could not be saved. Please try again.', { exact: true }).waitFor();
        assert.deepEqual(await snapshot(), before);
        await page.evaluate(async () => { const { db } = await import('/src/data/db/database.ts'); db.errors.hook('creating').unsubscribe(window.failureHook); });
        await page.evaluate(async () => { const { db } = await import('/src/data/db/database.ts'); db.reviews.hook('creating', window.failureHook); });
        await button('Save attempt').click();
        await page.getByText(ra ? 'Your Read Aloud attempt could not be saved. Please try again.' :
          'Your Repeat Sentence attempt could not be saved. Please try again.', { exact: true }).waitFor();
        assert.deepEqual(await snapshot(), before);
        await page.evaluate(async () => { const { db } = await import('/src/data/db/database.ts'); db.reviews.hook('creating').unsubscribe(window.failureHook); });
      }
      await saveOnce();
      const state = await snapshot();
      const { attempt, errors, reviews } = validateOutcome(state, before.attempts.length, item, raw, ra);
      if (!real && index === 0) assert.deepEqual([...new Set(errors.map(e => e.category))].sort(), ['insertion', 'omission', 'substitution']);
      console.log('Validated saved outcome:', item.id, 'score', attempt.score, 'errors', errors.length, 'reviews', reviews.length);
      observations.push({ kind: real ? 'controlled real engine' : 'mock runtime HTTP', itemId: item.id,
        expected: item.transcript, transcript: raw.text, score: attempt.score, errors: errors.length,
        reviews: reviews.length, timing: raw.timing, saved: true });
      if (!real && ra && index === 0) {
        // Regression: retranscribing a saved RA recording must clear the previous save identity.
        transcript = item.transcript;
        await button('Transcribe locally').click(); await text('Detected speech').waitFor();
        await button('Save attempt').waitFor();
        assert.equal(await button('Save attempt').isDisabled(), false);
      }
      await button(!real && ra && index === 0 ? 'Record again' : ra ? 'Retry same passage' : 'Retry same sentence').click();
      assert.equal(await text('Detected speech').count(), 0);
      assert.equal(await page.getByRole('heading', { name: 'Content result' }).count(), 0);
      if (ra) assert.equal(await page.getByRole('heading', { name: 'Fluency timing' }).count(), 0);
      assert.equal(await text('Attempt saved locally.').count(), 0);
      // Next resets helper/preview and question/source state.
      await button(ra ? 'Next passage' : 'Next question').click(); current++;
      if (ra) {
        assert.equal(await page.getByLabel('Show phrasing help').isChecked(), false);
        assert.equal(await page.getByLabel('Show stress targets').isChecked(), false);
        assert.equal(await button("I'm ready to read").count(), 1);
      } else {
        assert.equal(await button('Play sentence').count(), 1);
        assert.equal((await page.locator('body').innerText()).includes(items[current]?.transcript ?? 'impossible'), false);
      }
    }
  }

  if (real) {
    await page.goto(origin + '/study/repeat-sentence');
    await record('SILENCE', false);
    await button('Check local runtime').click();
    await text('Local Whisper transcription ready.').waitFor();
    const beforeSilence = await snapshot();
    const pending = page.waitForResponse(response => response.url().endsWith('/api/v1/transcribe'));
    await button('Transcribe locally').click();
    const response = await pending;
    assert.equal(response.status(), 422);
    assert.equal((await response.json()).error.code, 'NO_SPEECH');
    await page.locator('.speech-transcription-panel [role="alert"]').waitFor();
    assert.equal(await text('Your recording is ready.').count(), 1);
    assert.equal(await button('Save attempt').count(), 0);
    assert.deepEqual(await snapshot(), beforeSilence);
    console.log('Real MediaRecorder digital silence rejected as NO_SPEECH, no auto-save');
  }
  if (!real) {
    await page.goto(origin + '/study/repeat-sentence');
    await record('RS-1', false);
    await button('Check local runtime').click();
    await text('Local Whisper transcription ready.').waitFor();
    const beforeErrors = await snapshot();
    for (const failure of ['busy', 'timeout', 'silence', 'unsupported']) {
      mode = failure;
      await button(failure === 'busy' ? 'Transcribe locally' : 'Try transcription again').click();
      await page.locator('.speech-transcription-panel [role="alert"]').waitFor();
      assert.equal(await text('Your recording is ready.').count(), 1);
      assert.equal(await text('Detected speech').count(), 0);
      assert.equal(await button('Save attempt').count(), 0);
      assert.doesNotMatch(await page.locator('.speech-transcription-panel').innerText(), /private|stderr/);
      assert.deepEqual(await snapshot(), beforeErrors);
    }
    // A is delayed; reset, record B, transcribe B, then release stale A.
    mode = 'hold'; transcript = 'Stale response A.'; held = false;
    await button('Try transcription again').click();
    for (let count = 0; count < 100 && !held; count++) await page.waitForTimeout(20);
    assert.equal(held, true);
    await button('Record again').click();
    mode = 'success'; transcript = 'The final response belongs to B.';
    await record('RS-1', false);
    await button('Transcribe locally').click();
    await text('Detected speech').waitFor();
    releaseHeld();
    await page.waitForTimeout(100);
    assert.equal(await text('The final response belongs to B.').count(), 1);
    assert.equal(await text('Stale response A.').count(), 0);
    assert.deepEqual(await snapshot(), beforeErrors);
    // Unmount while another HTTP request is active, then open a clean RA task.
    mode = 'hold'; held = false; transcript = 'Stale navigated response.';
    await button('Transcribe locally').click();
    for (let count = 0; count < 100 && !held; count++) await page.waitForTimeout(20);
    assert.equal(held, true);
    await page.getByRole('link', { name: 'Study', exact: true }).click();
    await page.getByRole('link', { name: 'Read Aloud', exact: true }).click();
    releaseHeld();
    await page.waitForTimeout(100);
    assert.equal(await text('Detected speech').count(), 0);
    assert.equal(await button("I'm ready to read").count(), 1);
    console.log('Busy/timeout/no-speech/unsupported preserve recording and block save; A/B race and navigation discard stale HTTP results');
  }
  // WFD still compares and saves its normal local transaction without STT.
  await page.goto(origin + '/study/write-from-dictation');
  await button('Play audio').click();
  await button('Replay audio').waitFor();
  const beforeWfd = await snapshot();
  await page.getByLabel('Your answer').fill(writeFromDictationQuestions[0].answer);
  await button('Submit').click();
  await text('Attempt saved. Your word-level result is ready.').waitFor();
  const afterWfd = await snapshot();
  assert.equal(afterWfd.attempts.length, beforeWfd.attempts.length + 1);
  const wfd = afterWfd.attempts.find(a => a.taskType === 'write-from-dictation');
  assert.equal(wfd.responseText, writeFromDictationQuestions[0].answer);
  assert.equal(wfd.score, 1);
  await button('Next question').click();
  assert.equal(await page.getByLabel('Your answer').inputValue(), '');
  console.log('WFD source playback, exact comparison, explicit persistence and next/reset passed');
  assert.equal(await page.evaluate(() => window.browserSttCalls), 0);
  assert.equal(outbound.length, 0);
  assert.deepEqual(pageErrors, []);
  const report = { kind: real ? 'controlled TTS + real native inference' : 'mock HTTP + real browser/IndexedDB',
    learnerBenchmark: false, observations, submittedFields, outboundRequests: outbound.length, browserSttCalls: 0 };
  console.log(JSON.stringify(report, null, 2));
  if (real && process.argv.includes('--report')) await writeFile(new URL('../runtime/docs/controlled-migration-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
} finally {
  releaseHeld?.();
  await browser.close(); await runtime?.close(); await vite.close();
}
