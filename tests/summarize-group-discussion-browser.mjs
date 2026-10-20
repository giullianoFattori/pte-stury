import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { waitForBrowserServer } from './helpers/browser-readiness.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const vite = await createServer({ server: { host: '127.0.0.1', port: 5185, strictPort: true } });
await vite.listen();
const base = 'http://127.0.0.1:5185';
await waitForBrowserServer(vite, base + '/study/summarize-group-discussion', null);
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage(), pageErrors = [], remote = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(base) && !request.url().startsWith('blob:') && !request.url().startsWith('data:')) remote.push(request.url()); });
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      const context = new AudioContext(); await context.resume(); const destination = context.createMediaStreamDestination(), oscillator = context.createOscillator(); oscillator.connect(destination); oscillator.start(); return destination.stream;
    } });
  });
  await page.route('**/api/v1/health', route => route.fulfill({ json: { runtimeVersion: '0.1.0', apiVersion: 1, engine: 'whisper.cpp', engineVersion: '1.8.3', status: 'ready', model: { id: 'base.en', loaded: true }, processedLocally: true } }));
  await page.route('**/api/v1/transcribe', async route => route.fulfill({ json: { text: await page.evaluate(() => window.controlledTranscript), language: 'en', engine: 'whisper.cpp', model: 'base.en', processedLocally: true, timing: { audioMs: 800, inferenceMs: 20, totalMs: 30 } } }));

  async function selectedItem(taskType, itemId) {
    return page.evaluate(async ({ taskType, itemId }) => {
      const { db } = await import('/src/data/db/database.ts');
      if (itemId) return db.studyItems.get(itemId);
      const sessions = await db.studySessions.toArray(), session = sessions.find(value => value.status === 'active');
      if (session) return db.studyItems.get(session.itemIds[session.currentIndex]);
      return (await db.studyItems.where('taskType').equals(taskType).first());
    }, { taskType, itemId });
  }
  async function expectedResponse(item) {
    const data = item.taskData;
    return [...data.keyPoints, ...(data.speakerPoints ?? []).flatMap(speaker => speaker.points), ...(data.relationships ?? [])].join('. ');
  }
  async function speak(taskType) {
    const item = await selectedItem(taskType);
    await windowItem(item);
    const primary = taskType === 'summarize-group-discussion' ? 'Play discussion' : 'Play lecture';
    const label = taskType === 'summarize-group-discussion' ? 'Group discussion audio' : 'Lecture audio';
    await page.getByRole('button', { name: primary, exact: true }).click();
    await page.getByRole('status').filter({ hasText: taskType === 'summarize-group-discussion' ? 'Discussion is playing' : 'Lecture is playing' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Start recording', exact: true }).isDisabled(), true);
    await page.locator(`section[aria-label="${label}"] audio`).evaluate(audio => audio.dispatchEvent(new Event('ended')));
    await page.getByRole('timer').filter({ hasText: 'Preparation time remaining' }).waitFor();
    await page.getByRole('button', { name: 'Enable microphone', exact: true }).click();
    await page.waitForFunction(() => { const button = [...document.querySelectorAll('button')].find(value => value.textContent.trim() === 'Start recording'); return button && !button.disabled; }, undefined, { timeout: 15_000 });
    await page.getByRole('button', { name: 'Start recording', exact: true }).click();
    await page.waitForTimeout(350);
    await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
    await page.getByText('Your recording is ready.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Check local runtime', exact: true }).click();
    await page.getByText('Local Whisper transcription ready.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Transcribe locally', exact: true }).click();
    try { await page.getByText('Detected speech', { exact: true }).waitFor({ timeout: 8_000 }); }
    catch (error) { console.log('SGD transcription debug:', await page.locator('body').innerText()); throw error; }
    await page.getByRole('button', { name: 'Analyse audio locally' }).click();
    await page.getByRole('button', { name: 'Save attempt', exact: true }).waitFor();
    await page.waitForFunction(() => { const button = [...document.querySelectorAll('button')].find(value => value.textContent.trim() === 'Save attempt'); return button && !button.disabled; }, undefined, { timeout: 15_000 });
    await page.getByRole('button', { name: 'Save attempt', exact: true }).click();
    await page.getByText(/Attempt saved locally/).waitFor();
    const saved = await page.evaluate(async taskType => { const { db } = await import('/src/data/db/database.ts'); const rows = await db.attempts.where('taskType').equals(taskType).toArray(); return rows.at(-1); }, taskType);
    assert.equal(saved.metrics.processedLocally, true); assert.equal(saved.score, saved.metrics.keyPointCoverage); assert.ok(saved.durationMs > 0 && saved.durationMs <= (taskType === 'summarize-group-discussion' ? 120_000 : 40_000));
    if (taskType === 'summarize-group-discussion') { assert.equal(saved.metrics.speakerCoverage, 1); assert.ok(saved.metrics.relationshipCoverage === undefined || saved.metrics.relationshipCoverage === 1); }
    return saved;
  }
  async function windowItem(item) { const response = await expectedResponse(item); await page.evaluate(value => { window.controlledTranscript = value; }, response); }

  await page.goto(base + '/study/summarize-group-discussion');
  console.log('SGD browser: standalone loaded');
  await page.getByRole('button', { name: 'Play discussion', exact: true }).waitFor({ timeout: 20_000 });
  const standalone = await selectedItem('summarize-group-discussion'); assert.ok(standalone.id.startsWith('sgd-'));
  const standaloneAttempt = await speak('summarize-group-discussion');
  console.log('SGD browser: standalone saved');
  assert.equal(standaloneAttempt.metrics.speakerCoverage, 1);
  assert.equal(await page.getByLabel('Speaker 1 notes — Gary Jordan (host)').inputValue(), '');

  await page.goto(base + '/study');
  const taskCard = page.getByRole('region', { name: 'Task Practice', exact: true });
  await taskCard.getByRole('radio', { name: 'Summarize Group Discussion', exact: true }).check();
  await taskCard.getByText('3 questions available', { exact: true }).waitFor();
  const counts = taskCard.locator('input[name="task-count"]'); assert.equal(await counts.nth(0).isEnabled(), true); assert.equal(await counts.nth(1).isEnabled(), false);
  await counts.nth(2).check(); assert.equal(await counts.nth(2).isChecked(), true);
  await taskCard.getByRole('button', { name: 'Start Task Practice', exact: true }).click(); await page.waitForURL('**/study/session/*');
  await page.getByRole('heading', { name: 'Summarize Group Discussion', exact: true }).waitFor();
  console.log('SGD browser: Task Practice route loaded');
  const taskSession = await page.evaluate(async () => { const { db } = await import('/src/data/db/database.ts'); const session = (await db.studySessions.toArray()).find(value => value.status === 'active'); return { id: session.id, mode: session.mode, itemCount: session.config.itemCount, taskTypes: session.taskTypes }; });
  assert.equal(taskSession.mode, 'task'); assert.equal(taskSession.itemCount, 3); assert.deepEqual(taskSession.taskTypes, ['summarize-group-discussion']);
  await page.evaluate(async id => { const { db } = await import('/src/data/db/database.ts'); const session = await db.studySessions.get(id); session.status = 'abandoned'; session.finishedAt = new Date().toISOString(); await db.studySessions.put(session); }, taskSession.id);

  await page.goto(base + '/study');
  const mixed = await page.evaluate(async () => {
    const { startMixedPractice } = await import('/src/features/study-session/services/startMixedPractice.ts');
    return (await startMixedPractice({ taskTypes: ['retell-lecture', 'summarize-group-discussion'], itemCount: 2 })).session;
  });
  assert.equal(new Set(mixed.itemIds.map(id => id.startsWith('rtl-') ? 'retell-lecture' : 'summarize-group-discussion')).size, 2);
  await page.goto(base + '/study/session/' + mixed.id);
  console.log('SGD browser: Mixed route loaded');
  for (let index = 0; index < 2; index++) {
    const item = await selectedItem(); await speak(item.taskType);
    console.log(`SGD browser: mixed item ${index + 1} saved (${item.taskType})`);
    if (index === 0) { await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.getByRole('heading', { name: 'Retell Lecture', exact: true }).or(page.getByRole('heading', { name: 'Summarize Group Discussion', exact: true })).waitFor(); }
  }
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('heading', { name: 'Mixed Practice complete', exact: true }).waitFor();
  await page.getByText('Summarize Group Discussion', { exact: true }).waitFor();
  assert.deepEqual(pageErrors, []); assert.deepEqual(remote, []);
  const report = { status: 'PASS', browser: browser.version(), date: new Date().toISOString().slice(0, 10), standaloneSave: 'PASS', taskPracticeCapacity: { available: 3, countFiveDisabled: true, maxItemCount: taskSession.itemCount }, taskRoute: 'PASS', mixedRetellLectureTransitionAndSummary: 'PASS', localMediaRecorderAndControlledLocalStt: 'PASS', pageErrors: 0, unexpectedRequests: 0, dbVersion: 3 };
  await mkdir('audits', { recursive: true }); await writeFile('audits/summarize-group-discussion-08.03-browser.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report));
} finally { await browser?.close(); await vite.close(); }
