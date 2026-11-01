import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { waitForBrowserServer } from './helpers/browser-readiness.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 5202, strictPort: true } });
await server.listen(); const base = 'http://127.0.0.1:5202'; await waitForBrowserServer(server, base + '/study/reading-fill-blanks-drag-drop', null); let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext(); await context.addInitScript(() => { Math.random = () => 0; }); const errors = [], remote = [];
  context.on('page', page => { page.on('pageerror', error => errors.push(error.message)); page.on('request', req => { if (!req.url().startsWith(base) && !req.url().startsWith('blob:') && !req.url().startsWith('data:')) remote.push(req.url()); }); });
  const page = await context.newPage();
  const readItem = id => page.evaluate(async itemId => { const { db } = await import('/src/data/db/database.ts'); return db.studyItems.get(itemId); }, id);
  await page.goto(base + '/study/reading-fill-blanks-drag-drop');
  await page.getByRole('heading', { name: 'Reading: Fill in the Blanks — Drag and Drop', exact: true }).waitFor();
  const visibleWords = page.getByRole('button', { name: /^Word /u }); assert.equal(await page.getByRole('button', { name: /^Blank \d of 3,/u }).count(), 3);
  // Keyboard alternative: focus a word and activate it, then focus and activate a gap.
  const firstAnswer = (await visibleWords.first().getAttribute('aria-label')).replace(/^Word /u, '');
  const wordButton = page.getByRole('button', { name: `Word ${firstAnswer}`, exact: true }); await wordButton.focus(); await page.keyboard.press('Enter');
  const firstBlank = page.getByRole('button', { name: 'Blank 1 of 3, currently empty', exact: true }); await firstBlank.focus(); await page.keyboard.press('Space'); await page.getByRole('button', { name: `Blank 1 of 3, currently ${firstAnswer}`, exact: true }).waitFor();
  // Move the assigned word, replace a filled blank, and return the replacement to the bank.
  await page.getByRole('button', { name: 'Move word from blank 1', exact: true }).click(); await page.getByRole('button', { name: 'Blank 2 of 3, currently empty', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Blank 1 of 3, currently empty', exact: true }).count(), 1);
  const secondAnswer = (await visibleWords.first().getAttribute('aria-label')).replace(/^Word /u, '');
  await visibleWords.first().click(); await page.getByRole('button', { name: 'Blank 1 of 3, currently empty', exact: true }).click();
  const replacement = (await visibleWords.first().getAttribute('aria-label')).replace(/^Word /u, '');
  await visibleWords.first().click(); await page.getByRole('button', { name: `Blank 1 of 3, currently ${secondAnswer}`, exact: true }).click();
  await page.getByRole('button', { name: 'Clear blank 1', exact: true }).click(); await page.getByRole('button', { name: 'Clear blank 2', exact: true }).click();
  await page.getByRole('button', { name: `Word ${secondAnswer}`, exact: true }).waitFor(); await page.getByRole('button', { name: `Word ${replacement}`, exact: true }).waitFor();
  // Leave all gaps unanswered to verify zero-value omission semantics.
  await page.getByRole('button', { name: 'Submit response', exact: true }).click(); await page.getByText('0 / 3 · 0% blank accuracy', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Save attempt', exact: true }).click(); await page.getByText('Saved locally.', { exact: true }).waitFor();
  const attempt = await page.evaluate(async () => { const { db } = await import('/src/data/db/database.ts'); return (await db.attempts.where('taskType').equals('reading-fill-blanks-drag-drop').toArray()).at(-1); });
  const savedItem = await readItem(attempt.itemId); assert.equal(attempt.score, 0); assert.equal(attempt.responseData.kind, 'blank-choice'); assert.deepEqual(Object.keys(attempt.responseData.answers), savedItem.taskData.blanks.map(blank => blank.id));
  assert.ok(Object.values(attempt.responseData.answers).every(value => value === ''));
  await page.getByRole('button', { name: 'Retry this passage', exact: true }).click(); assert.equal(await page.getByRole('button', { name: 'Word ' + firstAnswer, exact: true }).isEnabled(), true);

  await page.goto(base + '/study'); const task = page.getByRole('region', { name: 'Task Practice', exact: true });
  await task.getByRole('radio', { name: 'Reading: Fill in the Blanks — Drag and Drop', exact: true }).check(); await task.getByText('5 questions available', { exact: true }).waitFor();
  await task.getByRole('radio', { name: '5', exact: true }).check(); await task.getByRole('button', { name: 'Start Task Practice', exact: true }).click(); await page.waitForURL('**/study/session/*');
  for (let i = 0; i < 5; i++) { await page.getByRole('heading', { name: 'Reading: Fill in the Blanks — Drag and Drop', exact: true }).waitFor(); await page.getByRole('button', { name: 'Submit response', exact: true }).click(); await page.getByRole('button', { name: 'Save attempt', exact: true }).click(); await page.getByRole('button', { name: 'Continue', exact: true }).click(); }
  await page.getByRole('heading', { name: 'Task Practice complete', exact: true }).waitFor(); const summary = page.getByRole('region', { name: 'Reading: Fill in the Blanks — Drag and Drop', exact: true }); await summary.getByText('5 questions', { exact: true }).waitFor(); await summary.getByText('Blank accuracy', { exact: true }).waitFor();
  assert.deepEqual(errors, []); assert.deepEqual(remote, []);
  console.log(JSON.stringify({ status: 'PASS', browser: browser.version(), keyboardAssignmentMoveReplaceClear: 'PASS', exactScoring: 'PASS', responseData: 'PASS', taskPracticeFiveSummary: 'PASS', pageErrors: errors.length, unexpectedRemoteRequests: remote.length, dbVersion: await page.evaluate(async () => { const { db } = await import('/src/data/db/database.ts'); return db.verno; }) }));
} finally { await browser?.close(); await server.close(); }
