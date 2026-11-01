import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { waitForBrowserServer } from './helpers/browser-readiness.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 5201, strictPort: true } });
await server.listen();
const base = 'http://127.0.0.1:5201';
await waitForBrowserServer(server, base + '/study/reading-fill-blanks-dropdown', null);
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext(); await context.addInitScript(() => { Math.random = () => 0; });
  const errors = [], remote = [];
  context.on('page', page => { page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (!request.url().startsWith(base) && !request.url().startsWith('blob:') && !request.url().startsWith('data:')) remote.push(request.url()); }); });
  const page = await context.newPage(); await page.clock.install();
  await page.addInitScript(() => { window.__playCount = 0; window.__microphoneCount = 0; window.__recorders = 0; HTMLMediaElement.prototype.play = function () { window.__playCount++; setTimeout(() => this.dispatchEvent(new Event('ended')), 120); return Promise.resolve(); }; const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = (...args) => { window.__microphoneCount++; return original(...args); }; window.MediaRecorder = class { constructor() { window.__recorders++; } }; });
  const readItem = id => page.evaluate(async itemId => { const { db } = await import('/src/data/db/database.ts'); return db.studyItems.get(itemId); }, id);
  const chooseAll = async item => { for (let i = 0; i < item.taskData.blanks.length; i++) await page.getByLabel(`Blank ${i + 1} of ${item.taskData.blanks.length}`).selectOption(item.taskData.blanks[i].answer); };
  const typeAll = async item => { for (let i = 0; i < item.taskData.blanks.length; i++) await page.getByLabel(`Blank ${i + 1} of ${item.taskData.blanks.length}`).fill(item.taskData.blanks[i].answer); };
  await page.goto(base + '/study/reading-fill-blanks-dropdown');
  await page.getByRole('heading', { name: 'Reading: Fill in the Blanks — Dropdown', exact: true }).waitFor();
  const item = await readItem('rfbd-000001'); assert.ok(item);
  assert.equal(await page.getByRole('combobox').count(), item.taskData.blanks.length);
  assert.equal(await page.getByLabel('Blank 1 of 5').inputValue(), '');
  await page.getByLabel('Blank 1 of 5').selectOption(item.taskData.blanks[0].options.find(option => option !== item.taskData.blanks[0].answer));
  await page.getByLabel('Blank 1 of 5').selectOption(item.taskData.blanks[0].answer);
  await page.getByRole('button', { name: 'Submit response', exact: true }).click();
  await page.getByText('1 / 5 · 20% blank accuracy', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Save attempt', exact: true }).click(); await page.getByText('Saved locally.', { exact: true }).waitFor();
  const attempt = await page.evaluate(async () => { const { db } = await import('/src/data/db/database.ts'); return (await db.attempts.where('taskType').equals('reading-fill-blanks-dropdown').toArray()).at(-1); });
  assert.equal(attempt.score, .2); assert.equal(attempt.responseData.kind, 'blank-choice'); assert.equal(attempt.responseData.answers[item.taskData.blanks[0].id], item.taskData.blanks[0].answer);
  await page.getByRole('button', { name: 'Retry this passage', exact: true }).click(); assert.equal(await page.getByLabel('Blank 1 of 5').inputValue(), '');

  await page.goto(base + '/study'); const task = page.getByRole('region', { name: 'Task Practice', exact: true });
  await task.getByRole('radio', { name: 'Reading: Fill in the Blanks — Dropdown', exact: true }).check(); await task.getByText('5 questions available', { exact: true }).waitFor();
  await task.getByRole('radio', { name: '5', exact: true }).check(); await task.getByRole('button', { name: 'Start Task Practice', exact: true }).click(); await page.waitForURL('**/study/session/*');
  for (let i = 0; i < 5; i++) {
    await page.getByRole('heading', { name: 'Reading: Fill in the Blanks — Dropdown', exact: true }).waitFor();
    const current = await page.evaluate(async () => { const { db } = await import('/src/data/db/database.ts'); const session = (await db.studySessions.toArray()).find(row => row.status === 'active'); return db.studyItems.get(session.itemIds[session.currentIndex]); });
    await chooseAll(current); await page.getByRole('button', { name: 'Submit response', exact: true }).click(); await page.getByRole('button', { name: 'Save attempt', exact: true }).click(); await page.getByRole('button', { name: 'Continue', exact: true }).click();
  }
  await page.getByRole('heading', { name: 'Task Practice complete', exact: true }).waitFor();
  const summary = page.getByRole('region', { name: 'Reading: Fill in the Blanks — Dropdown', exact: true }); await summary.getByText('5 questions', { exact: true }).waitFor(); await summary.getByText('Blank accuracy', { exact: true }).waitFor();

  await page.getByRole('link', { name: 'Back to Study', exact: true }).click(); const mixed = page.getByRole('region', { name: 'Mixed Practice', exact: true });
  await mixed.getByRole('checkbox', { name: 'Listening: Fill in the Blanks — Type In', exact: true }).check();
  await mixed.getByRole('checkbox', { name: 'Reading: Fill in the Blanks — Dropdown', exact: true }).check();
  for (const name of ['Write From Dictation','Repeat Sentence','Read Aloud','Retell Lecture','Summarize Group Discussion','Describe Image','Summarize Written Text','Summarize Spoken Text','Highlight Incorrect Words']) {
    const checkbox = mixed.getByRole('checkbox', { name, exact: true }); if (await checkbox.isChecked()) await checkbox.uncheck();
  }
  await mixed.getByRole('radio', { name: '5', exact: true }).check(); await mixed.getByRole('button', { name: 'Start Mixed Practice', exact: true }).click(); await page.waitForURL('**/study/session/*');
  const first = await page.evaluate(async () => { const { db } = await import('/src/data/db/database.ts'); const s = (await db.studySessions.toArray()).find(row => row.status === 'active'); return db.studyItems.get(s.itemIds[0]); }); assert.equal(first.taskType, 'listening-fill-blanks-type-in');
  await page.getByRole('button', { name: 'Start question', exact: true }).click(); await page.clock.fastForward(7000); await page.getByText(/Audio is playing once/u).waitFor();
  await typeAll(first); await page.clock.fastForward(150); await page.getByText(/Audio ended/u).waitFor(); await page.getByRole('button', { name: 'Submit response', exact: true }).click(); await page.getByRole('button', { name: 'Save attempt', exact: true }).click(); await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('heading', { name: 'Reading: Fill in the Blanks — Dropdown', exact: true }).waitFor();
  const second = await page.evaluate(async () => { const { db } = await import('/src/data/db/database.ts'); const s = (await db.studySessions.toArray()).find(row => row.status === 'active'); return db.studyItems.get(s.itemIds[s.currentIndex]); }); assert.equal(second.taskType, 'reading-fill-blanks-dropdown');
  await chooseAll(second); await page.getByRole('button', { name: 'Submit response', exact: true }).click(); await page.getByRole('button', { name: 'Save attempt', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  for (let index = 2; index < 5; index++) {
    const current = await page.evaluate(async () => { const { db } = await import('/src/data/db/database.ts'); const s = (await db.studySessions.toArray()).find(row => row.status === 'active'); return db.studyItems.get(s.itemIds[s.currentIndex]); });
    if (current.taskType === 'listening-fill-blanks-type-in') {
      await page.getByRole('button', { name: 'Start question', exact: true }).click(); await page.clock.fastForward(7000); await page.getByText(/Audio is playing once/u).waitFor();
      await typeAll(current); await page.clock.fastForward(150); await page.getByText(/Audio ended/u).waitFor();
    } else { assert.equal(current.taskType, 'reading-fill-blanks-dropdown'); await chooseAll(current); }
    await page.getByRole('button', { name: 'Submit response', exact: true }).click(); await page.getByRole('button', { name: 'Save attempt', exact: true }).click(); await page.getByRole('button', { name: 'Continue', exact: true }).click();
  }
  await page.getByRole('heading', { name: 'Mixed Practice complete', exact: true }).waitFor();
  await page.getByRole('region', { name: 'Listening: Fill in the Blanks — Type In', exact: true }).getByText('3 questions', { exact: true }).waitFor();
  await page.getByRole('region', { name: 'Reading: Fill in the Blanks — Dropdown', exact: true }).getByText('2 questions', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__microphoneCount), 0); assert.equal(await page.evaluate(() => window.__recorders), 0); assert.deepEqual(errors, []); assert.deepEqual(remote, []);
  console.log(JSON.stringify({ status: 'PASS', browser: browser.version(), standalone: 'PASS', exactBlankScoring: 'PASS', responseData: 'PASS', taskPracticeFive: 'PASS', mixedLfbToDropdown: 'PASS', mediaRuntimeCalls: 0, pageErrors: errors.length, unexpectedRemoteRequests: remote.length, dbVersion: await page.evaluate(async () => { const { db } = await import('/src/data/db/database.ts'); return db.verno; }) }));
} finally { await browser?.close(); await server.close(); }
