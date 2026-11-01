import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { waitForBrowserServer } from './helpers/browser-readiness.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 5198, strictPort: true } });
await server.listen();
const base = 'http://127.0.0.1:5198';
await waitForBrowserServer(server, base + '/study/listening-fill-blanks-type-in', null);
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext(); await context.addInitScript(() => { Math.random = () => 0; });
  const errors = [], remote = [];
  context.on('page', page => { page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (!request.url().startsWith(base) && !request.url().startsWith('blob:') && !request.url().startsWith('data:')) remote.push(request.url()); }); });
  const page = await context.newPage(); await page.clock.install();
  await page.addInitScript(() => { window.__playCount = 0; window.__microphoneCount = 0; window.__recorders = 0; HTMLMediaElement.prototype.play = function () { window.__playCount++; setTimeout(() => this.dispatchEvent(new Event('ended')), 120); return Promise.resolve(); }; const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = (...args) => { window.__microphoneCount++; return original(...args); }; window.MediaRecorder = class { constructor() { window.__recorders++; } }; });
  const savedAttempt = task => page.evaluate(async taskType => { const { db } = await import('/src/data/db/database.ts'); return (await db.attempts.where('taskType').equals(taskType).toArray()).at(-1); }, task);
  await page.goto(base + '/study/listening-fill-blanks-type-in'); await page.getByRole('heading', { name: 'Listening: Fill in the Blanks — Type In', exact: true }).waitFor();
  const item = await page.evaluate(async () => { const { db } = await import('/src/data/db/database.ts'); return db.studyItems.get('lfb-000001'); }); assert.ok(item);
  await page.getByRole('button', { name: 'Start question', exact: true }).click(); await page.getByRole('timer').waitFor();
  assert.equal(await page.getByLabel(`Blank 1 of ${item.taskData.blanks.length}`).isDisabled(), true); await page.clock.fastForward(7000);
  await page.getByText(/Audio is playing once/u).waitFor(); assert.equal(await page.evaluate(() => window.__playCount), 1); assert.equal(await page.getByLabel(`Blank 1 of ${item.taskData.blanks.length}`).isDisabled(), false);
  for (let index = 0; index < item.taskData.blanks.length; index++) await page.getByLabel(`Blank ${index + 1} of ${item.taskData.blanks.length}`).fill(item.taskData.blanks[index].answer);
  await page.clock.fastForward(150); await page.getByText(/Audio ended/u).waitFor(); await page.getByRole('button', { name: 'Submit response', exact: true }).click();
  await page.getByText(`${item.taskData.blanks.length} / ${item.taskData.blanks.length} · 100% blank accuracy`, { exact: true }).waitFor(); await page.getByRole('button', { name: 'Save attempt', exact: true }).click(); await page.getByText('Saved locally.', { exact: true }).waitFor();
  let attempt = await savedAttempt('listening-fill-blanks-type-in'); assert.equal(attempt.score, 1); assert.deepEqual(attempt.responseData, { kind: 'blank-text', answers: Object.fromEntries(item.taskData.blanks.map(blank => [blank.id, blank.answer])) });
  await page.getByRole('button', { name: 'Retry this item', exact: true }).click(); assert.equal(await page.evaluate(() => window.__playCount), 1);

  await page.goto(base + '/study'); const card = page.getByRole('region', { name: 'Task Practice', exact: true });
  await card.getByRole('radio', { name: 'Listening: Fill in the Blanks — Type In', exact: true }).check(); await card.getByText('5 questions available', { exact: true }).waitFor();
  await card.getByRole('radio', { name: '5', exact: true }).check(); await card.getByRole('button', { name: 'Start Task Practice', exact: true }).click(); await page.waitForURL('**/study/session/*');
  for (let i = 0; i < 5; i++) {
    await page.getByRole('heading', { name: 'Listening: Fill in the Blanks — Type In', exact: true }).waitFor();
    const current = await page.evaluate(async () => { const { db } = await import('/src/data/db/database.ts'); const session = (await db.studySessions.toArray()).find(row => row.status === 'active'); return db.studyItems.get(session.itemIds[session.currentIndex]); });
    await page.getByRole('button', { name: 'Start question', exact: true }).click(); await page.clock.fastForward(7000); await page.getByText(/Audio is playing once/u).waitFor();
    for (let index = 0; index < current.taskData.blanks.length; index++) await page.getByLabel(`Blank ${index + 1} of ${current.taskData.blanks.length}`).fill(current.taskData.blanks[index].answer);
    await page.clock.fastForward(150); await page.getByText(/Audio ended/u).waitFor(); await page.getByRole('button', { name: 'Submit response', exact: true }).click(); await page.getByRole('button', { name: 'Save attempt', exact: true }).click(); await page.getByRole('button', { name: 'Continue', exact: true }).click();
  }
  await page.getByRole('heading', { name: 'Task Practice complete', exact: true }).waitFor(); const summary = page.getByRole('region', { name: 'Listening: Fill in the Blanks — Type In', exact: true }); await summary.getByText('5 questions', { exact: true }).waitFor(); await summary.getByText('Perfect items', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__microphoneCount), 0); assert.equal(await page.evaluate(() => window.__recorders), 0); assert.deepEqual(errors, []); assert.deepEqual(remote, []);
  console.log(JSON.stringify({ status: 'PASS', browser: browser.version(), standalone: 'PASS', sevenSecondSkim: 'PASS', singlePlayback: 'PASS', taskPracticeFive: 'PASS', summary: 'PASS', microphoneRequests: 0, mediaRecorderInstances: 0, pageErrors: errors.length, unexpectedRemoteRequests: remote.length, dbVersion: await page.evaluate(async () => { const { db } = await import('/src/data/db/database.ts'); return db.verno; }) }));
} finally { await browser?.close(); await server.close(); }
