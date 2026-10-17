// Linux build-host certification, using extracted owned artifacts and real local Whisper.
// Controlled TTS -> Web Audio -> actual MediaRecorder -> packaged ffmpeg/whisper.cpp.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { readFile, writeFile, mkdir, mkdtemp, rm, readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('Linux x64 validation host required');
const work = resolve('.local-packaging/session-validation');
await mkdir(work, { recursive: true });
const extraction = await mkdtemp(join(work, 'extracted-'));
const profile = await mkdtemp(join(work, 'profile-'));
const packageRoot = join(extraction, 'PTE-Study');
process.env.PACKAGE_VALIDATION_ROOT = packageRoot;
const { origin, archive, launch, ready, quit, identity, tempEntries, childPids } = await import('../runtime-validation/common.mjs');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const createdAt = new Date().toISOString(), sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const errors = [], remote = [], developmentRequests = [], cspViolations = [], mimeTypes = new Set(), timings = {}, nativeProcesses = new Set(), traces = [], deepLinks = [], speechCases = [];
let runtime, context, page, activeId;
const timed = async (key, action) => { const start = performance.now(); const result = await action(); timings[key] = Math.round(performance.now() - start); return result; };
async function stop() {
  if (!runtime) return;
  for (const pid of await childPids(runtime.child.pid)) nativeProcesses.add(pid);
  await quit(runtime, packageRoot);
  for (const pid of nativeProcesses) await assert.rejects(stat(`/proc/${pid}`), error => error.code === 'ENOENT');
  assert.deepEqual(await tempEntries(), []);
  runtime = undefined;
}
async function startRuntime(key) {
  const trace = join(work, `network-${Date.now()}`); traces.push(trace);
  runtime = launch(['--no-browser'], packageRoot, trace);
  await timed(key, () => ready(runtime));
  const health = await (await fetch(origin + '/api/v1/health')).json();
  assert.equal(health.status, 'ready'); assert.equal(health.apiVersion, 1); assert.equal(health.model.loaded, true);
  assert.equal(health.engine, 'whisper.cpp'); assert.equal(health.processedLocally, true);
}
async function browserProfile() {
  context = await chromium.launchPersistentContext(profile, { executablePath: '/usr/bin/google-chrome', headless: true,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-background-networking'] });
  await context.exposeBinding('__sessionCspViolation', (_source, directive) => { cspViolations.push(directive); });
  await context.addInitScript(() => {
    Math.random = () => 0;
    window.uploadMetadata = []; window.sessionCsp = [];
    const original = window.fetch;
    window.fetch = function(input, options) {
      if (String(input).endsWith('/api/v1/transcribe') && options?.body instanceof FormData)
        window.uploadMetadata.push({ keys: [...options.body.keys()].sort(), mime: options.body.get('audio')?.type });
      return original.call(this, input, options);
    };
    document.addEventListener('securitypolicyviolation', event => { window.sessionCsp.push(event.violatedDirective); void window.__sessionCspViolation(event.violatedDirective); });
  });
  context.on('page', p => {
    p.on('pageerror', () => errors.push('pageerror'));
    p.on('request', request => {
      if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origin) remote.push('non-local-request');
      if (/\/@vite\/|\/@react-refresh|\/src\/|\.map(?:$|\?)/.test(request.url())) developmentRequests.push('development-asset');
    });
  });
  // Simulated disconnected internet at the browser boundary; loopback remains available.
  await context.route('**/*', route => {
    const url = route.request().url();
    return /^https?:/.test(url) && new URL(url).origin !== origin ? route.abort('internetdisconnected') : route.continue();
  });
  page = await context.newPage(); page.setDefaultTimeout(45000);
}
async function snapshot(p = page) {
  return p.evaluate(async () => {
    const database = await new Promise((resolve, reject) => { const r = indexedDB.open('pte-study-db'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const data = { version: database.version / 10 };
    for (const name of ['studyItems', 'contentState', 'studySessions', 'attempts', 'errors', 'reviews']) {
      data[name] = await new Promise((resolve, reject) => { const r = database.transaction(name).objectStore(name).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    }
    database.close(); return data;
  });
}
const button = (name, p = page) => p.getByRole('button', { name, exact: true });
async function current(p = page) {
  const data = await snapshot(p), session = data.studySessions.find(s => s.id === activeId);
  assert.ok(session); assert.ok(data.studySessions.filter(s => s.status === 'active').length <= 1);
  return { session, item: data.studyItems.find(i => i.id === session.itemIds[Math.min(session.currentIndex, session.itemIds.length - 1)]) };
}
async function progress(index, total, p = page) {
  await p.getByRole('status').filter({ hasText: `Question ${index + 1} of ${total}` }).waitFor();
}
async function wfd(p = page, partial = false) {
  const { item } = await current(p);
  const answer = partial ? item.answer.split(/\s+/).slice(1).join(' ') : item.answer;
  await p.getByLabel('Your answer', { exact: true }).fill(answer); await button('Submit', p).click();
}
async function speech(task) {
  const fixture = task === 'read-aloud' ? 'RA-1' : 'RS-1';
  const audio = await readFile(`tools/local-stt/tmp/controlled/${fixture}.wav`);
  await page.route('**/__session-validation.wav', route => route.fulfill({ body: audio, contentType: 'audio/wav' }));
  await page.evaluate(async () => {
    const audio = new AudioContext(); await audio.resume(); const destination = audio.createMediaStreamDestination();
    const buffer = await audio.decodeAudioData(await (await fetch('/__session-validation.wav')).arrayBuffer());
    navigator.mediaDevices.getUserMedia = async () => destination.stream.clone();
    window.playSessionFixture = () => { const src = audio.createBufferSource(); src.buffer = buffer; src.connect(destination); const done = new Promise(resolve => { src.onended = resolve; }); src.start(); return done; };
    window.fixtureContext = audio;
  });
  if (task === 'read-aloud') await button("I'm ready to read").click();
  await button('Enable microphone').click();
  if (task === 'repeat-sentence') { await button('Play sentence').click(); await button('Replay sentence').waitFor(); }
  await button('Start recording').click(); await page.evaluate(() => window.playSessionFixture()); await button('Stop recording').click();
  await page.getByText('Your recording is ready.', { exact: true }).waitFor();
  await button('Check local runtime').click(); await page.getByText('Local Whisper transcription ready.', { exact: true }).waitFor();
  const response = page.waitForResponse(r => r.url() === origin + '/api/v1/transcribe', { timeout: 90000 });
  await button('Transcribe locally').click(); const result = await response;
  assert.equal(result.status(), 200); const body = await result.json();
  assert.ok(!runtime.output().includes(body.text.trim()) && !runtime.error().includes(body.text.trim()), 'Native transcript must not enter launcher logs');
  assert.equal(body.engine, 'whisper.cpp'); assert.equal(body.processedLocally, true); assert.ok(body.text.trim());
  const upload = await page.evaluate(() => window.uploadMetadata.at(-1)); assert.deepEqual(upload.keys, ['audio', 'language']); mimeTypes.add(upload.mime);
  await page.getByRole('heading', { name: 'Content result', exact: true }).waitFor();
  if (task === 'read-aloud') { await button('Analyse audio locally').click(); await page.waitForFunction(() => !document.querySelector('.ra-attempt-save button').disabled); }
  await button('Save attempt').click(); await button('Continue').waitFor();
  const { session } = await current(); const saved = (await snapshot()).attempts.find(a => a.id === session.attemptIds.at(-1));
  assert.equal(saved.metrics.processedLocally, true); assert.equal(saved.responseText, body.text);
  speechCases.push({ taskType: task, engine: body.engine, processedLocally: true, status: 'PASS' });
  await page.evaluate(() => window.fixtureContext.close()); await page.unroute('**/__session-validation.wav');
}
async function endSession() {
  await button('End session').click(); const dialog = page.getByRole('dialog', { name: 'End this study session?', exact: true });
  await dialog.getByRole('button', { name: 'Keep studying', exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'End session', exact: true }).click();
  await page.waitForURL(origin + '/study'); await button('Start Quick Practice').waitFor();
  assert.equal(await button('Resume current session').count(), 0);
}
async function offlineProbe() {
  const home = await mkdtemp(join(work, 'offline-home-'));
  const args = ['--die-with-parent', '--new-session', '--unshare-all', '--ro-bind', packageRoot, '/app', '--bind', home, '/home/tester', '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--ro-bind', resolve('tools/content-validation/offline-probe.mjs'), '/probe.mjs'];
  for (const [source, dest] of [['RA-1', 'ra'], ['RS-1', 'rs']]) args.push('--ro-bind', resolve(`tools/local-stt/tmp/controlled/${source}.wav`), `/${dest}.wav`);
  for (const name of ['libc.so.6', 'libm.so.6', 'libdl.so.2', 'libpthread.so.0', 'librt.so.1']) args.push('--ro-bind', `/lib/x86_64-linux-gnu/${name}`, `/lib/x86_64-linux-gnu/${name}`);
  args.push('--ro-bind', '/lib64/ld-linux-x86-64.so.2', '/lib64/ld-linux-x86-64.so.2', '--clearenv', '--setenv', 'HOME', '/home/tester', '--setenv', 'PATH', '/nonexistent', '--setenv', 'LD_LIBRARY_PATH', '/app/native', '/app/native/node', '/probe.mjs');
  try {
    const child = spawn('/usr/bin/bwrap', args, { stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = '';
    child.stdout.on('data', data => { stdout = (stdout + data).slice(-65536); }); child.stderr.resume();
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    assert.equal(code, 0, 'Offline namespace probe failed'); return JSON.parse(stdout.trim());
  } finally { await rm(home, { recursive: true, force: true }); }
}
try {
  // Fail without disturbing any existing user runtime on the stable origin.
  const probe = createServer(); await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(8765, '127.0.0.1', resolve); }); await new Promise(resolve => probe.close(resolve));
  execFileSync('tar', ['-xJf', archive, '-C', extraction]);
  const baseline = JSON.parse(await readFile('audits/session-07.10-browser-closure.json', 'utf8'));
  assert.equal(baseline.status, 'PASS'); assert.equal(baseline.gitCommit, sourceCommit);
  const packageIdentity = await identity();
  assert.equal(packageIdentity.gitCommit, sourceCommit, 'Rebuild package from the validated source revision');
  console.log(JSON.stringify({ event: 'package-verified', target: packageIdentity.target }));
  const packageManifest = JSON.parse(await readFile(join(packageRoot, 'manifest/package.json'), 'utf8'));
  const catalogManifest = JSON.parse(await readFile(join(packageRoot, 'web/content/question-bank.manifest.json'), 'utf8'));
  await startRuntime('runtimeReadyMs'); await browserProfile();
  console.log(JSON.stringify({ event: 'runtime-ready' }));
  await timed('studyLoadMs', async () => { await page.goto(origin + '/study'); await button('Start Quick Practice').waitFor(); });
  const initial = await snapshot(); assert.equal(initial.version, 3); assert.equal(initial.studyItems.length, 17);
  assert.equal(initial.studyItems.filter(i => i.status === 'active' && i.catalogAvailable).length, 17); assert.ok(initial.studyItems.every(i => !i.id.endsWith('900001')));
  assert.equal(initial.attempts.length, 0); assert.equal(initial.studySessions.length, 0);
  for (const path of ['/study', '/study/write-from-dictation', '/study/repeat-sentence', '/study/read-aloud']) {
    const response = await page.goto(origin + path); assert.equal(response.status(), 200); await page.getByRole('link', { name: 'Study', exact: true }).waitFor();
    assert.match(response.headers()['content-security-policy'], /script-src 'self'/); deepLinks.push(path);
  }
  await page.goto(origin + '/study');
  await timed('quickStartMs', async () => { await button('Start Quick Practice').click(); await page.waitForURL('**/study/session/*'); await progress(0, 5); });
  activeId = page.url().split('/').at(-1); const quickId = activeId, quickUrl = page.url(), frozen = (await current()).session.itemIds;
  assert.equal(frozen.length, 5); assert.equal(new Set(frozen).size, 5); deepLinks.push('/study/session/:id');
  assert.equal((await page.reload()).status(), 200, 'Packaged session deep link must serve SPA on refresh'); await progress(0, 5); await wfd(page, true); await button('Continue').waitFor();
  assert.equal((await current()).session.currentIndex, 1); const beforeRestart = await snapshot(); assert.equal(beforeRestart.attempts.length, 1);
  console.log(JSON.stringify({ event: 'first-answer-saved' }));
  await context.close(); context = undefined; await stop(); await startRuntime('restartReadyMs'); await browserProfile();
  await page.goto(quickUrl); await progress(1, 5); assert.deepEqual(await snapshot(), beforeRestart); assert.deepEqual((await current()).session.itemIds, frozen);
  await page.getByRole('link', { name: 'Back to Study', exact: true }).click();
  await timed('resumeMs', async () => { await button('Resume current session').click(); await progress(1, 5); });
  for (let index = 1; index < 5; index++) {
    const { item } = await current();
    if (item.taskType === 'write-from-dictation') await wfd(); else await speech(item.taskType);
    await button('Continue').waitFor();
    console.log(JSON.stringify({ event: 'queue-item-saved', position: index + 1 }));
    if (index < 4) await timed(`continue${index}Ms`, async () => { await button('Continue').click(); await progress(index + 1, 5); });
  }
  assert.equal((await current()).session.status, 'completed');
  await timed('summaryLoadMs', async () => { await button('Continue').click(); await page.locator('.session-summary').waitFor(); });
  for (const [name, count] of [['Write From Dictation', 2], ['Repeat Sentence', 2], ['Read Aloud', 1]]) {
    const card = page.getByRole('region', { name, exact: true }); await card.waitFor(); assert.match(await card.innerText(), new RegExp(`${count} questions`));
  }
  await page.getByText('These are practice metrics from this app, not an official PTE score.', { exact: true }).waitFor();
  const summaryText = await page.locator('.session-summary').innerText(); assert.match(summaryText, /5 questions completed · \d+ (sec|min|hr)/);
  assert.equal(await page.getByText(/Overall PTE:/).count(), 0);
  await page.reload(); await page.locator('.session-summary').waitFor(); assert.equal(await page.locator('.session-summary').innerText(), summaryText);
  const completedHistory = await snapshot();
  console.log(JSON.stringify({ event: 'quick-summary-pass' }));
  await page.getByRole('link', { name: 'Back to Study', exact: true }).click();
  const taskCard = page.getByRole('region', { name: 'Task Practice', exact: true }); await taskCard.getByRole('radio', { name: '3', exact: true }).check();
  await button('Start Task Practice').click(); await page.waitForURL('**/study/session/*'); await progress(0, 3); activeId = page.url().split('/').at(-1); const taskUrl = page.url();
  assert.equal((await current()).session.mode, 'task'); assert.ok((await current()).session.itemIds.every(id => id.startsWith('wfd-')));
  const stale = await context.newPage(); await stale.goto(taskUrl); await progress(0, 3, stale);
  await wfd(); await button('Continue').waitFor(); await wfd(stale);
  await stale.getByRole('alert').filter({ hasText: 'This session changed in another tab.' }).waitFor(); assert.equal(await button('Continue', stale).count(), 0);
  await button('Reload session', stale).click(); await progress(1, 3, stale); await stale.close();
  await page.getByRole('link', { name: 'Back to Study', exact: true }).click(); await button('Resume current session').click(); await progress(1, 3);
  const beforeAbandon = await snapshot(); await endSession(); const afterAbandon = await snapshot();
  for (const table of ['attempts', 'errors', 'reviews']) assert.deepEqual(afterAbandon[table], beforeAbandon[table]);
  assert.equal(afterAbandon.studySessions.find(s => s.id === activeId).status, 'abandoned');
  await page.goto(taskUrl); await page.getByRole('heading', { name: 'This study session has ended.', exact: true }).waitFor(); await page.reload(); await page.getByRole('heading', { name: 'This study session has ended.', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Back to Study', exact: true }).click();
  const mixed = page.getByRole('region', { name: 'Mixed Practice', exact: true }); await mixed.getByRole('radio', { name: '5', exact: true }).check();
  await button('Start Mixed Practice').click(); await page.waitForURL('**/study/session/*'); await progress(0, 5); activeId = page.url().split('/').at(-1); const mixedUrl = page.url();
  const mixedQueue = (await current()).session; assert.equal(mixedQueue.mode, 'mixed'); assert.deepEqual(mixedQueue.itemIds.map(id => id.split('-')[0]), ['wfd', 'rs', 'ra', 'wfd', 'rs']);
  await wfd(); await button('Continue').waitFor(); await page.reload(); await progress(1, 5); assert.equal((await current()).item.taskType, 'repeat-sentence');
  await page.getByRole('button', { name: 'Enable microphone', exact: true }).waitFor(); await endSession();
  await page.goto(mixedUrl); await page.getByRole('heading', { name: 'This study session has ended.', exact: true }).waitFor();
  activeId = quickId; await page.goto(quickUrl); await page.locator('.session-summary').waitFor(); assert.equal(await page.locator('.session-summary').innerText(), summaryText);
  const finalData = await snapshot(); assert.ok(completedHistory.attempts.every(a => finalData.attempts.some(b => JSON.stringify(a) === JSON.stringify(b))));
  for (const session of finalData.studySessions) {
    assert.equal(typeof session.finishedAt, 'string');
    assert.equal(new Set(session.itemIds).size, session.itemIds.length); assert.equal(session.attemptIds.length, session.currentIndex);
    for (const [index, id] of session.attemptIds.entries()) { const a = finalData.attempts.find(a => a.id === id); assert.equal(a.sessionId, session.id); assert.equal(a.itemId, session.itemIds[index]); assert.equal(a.itemRevision, 1); }
  }
  assert.equal(finalData.attempts.length, finalData.studySessions.reduce((sum, session) => sum + session.attemptIds.length, 0), 'No unreferenced session outcomes');
  assert.equal(finalData.studySessions.filter(s => s.status === 'active').length, 0);
  assert.deepEqual(await page.evaluate(() => window.sessionCsp), []); assert.deepEqual(errors, []); assert.deepEqual(remote, []); assert.deepEqual(developmentRequests, []); assert.deepEqual(cspViolations, []);
  const browser = context.browser()?.version() ?? 'Chrome persistent context';
  await context.close(); context = undefined; await stop();
  const connections = [];
  for (const trace of traces) for (const file of (await readdir(work)).filter(file => file.startsWith(trace.split('/').at(-1) + '.'))) {
    const raw = await readFile(join(work, file), 'utf8');
    for (const line of raw.split('\n').filter(line => /connect\(.*sa_family=AF_INET6?[,}]/.test(line))) {
      assert.match(line, /127\.0\.0\.1/, 'Non-loopback runtime connection'); connections.push('127.0.0.1');
    }
  }
  assert.ok(connections.length > 0, 'Runtime network instrumentation produced no loopback evidence');
  console.log(JSON.stringify({ event: 'sessions-network-shutdown-pass' }));
  const offline = await offlineProbe(); assert.equal(offline.status, 'PASS');
  const assets = packageManifest.artifacts.filter(a => /^web\/assets\//.test(a.path));
  const report = { status: 'PASS', activity: '07', step: '07.10', createdAt, finishedAt: new Date().toISOString(), gitCommit: sourceCommit, platform: 'linux-x64', browser,
    identity: packageIdentity, contentVersion: catalogManifest.contentVersion, scope: 'Extracted unsigned internal package on existing Linux build host; persistent synthetic browser profile; actual packaged decoder and Whisper using controlled TTS/Web Audio; no clean-machine or human microphone/quality certification',
    resolvedFindings: [{ severity: 'medium', owner: 'Activity 05 runtime static serving', impact: 'Activity 07 refresh/deep-link usability', issue: 'Session route returned 404 on direct navigation', fixCommit: '291f8bf', resolution: 'Bounded identity-only SPA fallback with query/path/method isolation regression tests' }],
    launcher: 'PASS', sameOrigin: 'PASS', spaRoutes: { status: 'PASS', paths: deepLinks }, indexedDb: 'PASS', dexieVersion: finalData.version,
    freshInstall: { status: 'PASS', learnerItems: 17, technicalItems: 0, sessions: 0, attempts: 0 },
    quick: { status: 'PASS', questions: 5, fullCompletion: 'PASS', taskCards: 3 }, task: { status: 'PASS', selected: 'write-from-dictation', questions: 3, partialSaveResumeAbandon: 'PASS' },
    mixed: { status: 'PASS', questions: 5, taskSequence: ['wfd', 'rs', 'ra', 'wfd', 'rs'], transitionRefreshResumeAbandon: 'PASS' },
    resume: 'PASS', frozenQueueAfterBootstrapRestart: 'PASS', summary: 'PASS', summaryReload: 'PASS', abandon: 'PASS', abandonedReload: 'PASS', crossTabConflictReload: 'PASS',
    runtimeRestart: { status: 'PASS', runtimeRestarted: true, browserProcessRestarted: true, sameProfilePreserved: true, currentIndex: 1, persistedAttempts: 1 },
    integrity: { oneActiveMax: 'PASS', uniqueQueue: 'PASS', attemptLinkage: 'PASS', atomicProgress: 'PASS', abandonPreservesHistory: 'PASS', completedSummaryStable: 'PASS' },
    speech: 'PASS', speechCases, mediaRecorderMIME: [...mimeTypes], expectedAnswerInUpload: false,
    offline: { status: 'PASS', browser: 'Non-origin HTTP blocked; zero attempted remote app requests', runtime: offline, instrumentation: 'strace connect on launcher-owned tree across both runs', loopbackConnectCalls: connections.length },
    pageErrors: 0, remoteRequests: 0, developmentAssetRequests: 0, cspViolations: 0, launcherBrowserHandoff: 'Not separately repeated; --no-browser plus automated Chrome', privacy: { noLearnerRecordingsCommitted: true, noRawTranscriptInAudit: true, noTranscriptInLauncherLogs: true }, shutdown: { status: 'PASS', noOwnedProcessRemaining: true, requestTempEntries: 0 }, timingsMs: timings,
    sizes: { archiveBytes: (await stat(archive)).size, frontendJsBytes: assets.filter(a => a.path.endsWith('.js')).reduce((sum, a) => sum + a.size, 0), frontendCssBytes: assets.filter(a => a.path.endsWith('.css')).reduce((sum, a) => sum + a.size, 0) },
    automatedBaseline: baseline.testCounts,
    gates: { cleanMachineLinux: 'PENDING', windows: 'PENDING', macos: 'PENDING', physicalMicrophone: 'PENDING', humanModelBenchmark: 'PENDING', signingNotarization: 'PENDING', manualHumanSmoke: 'PENDING' } };
  await mkdir('audits', { recursive: true }); await writeFile('audits/session-07.10-package.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, platform: report.platform, speech: report.speech, timingsMs: timings, remoteRequests: 0 }));
} finally {
  await context?.close(); await stop();
  await rm(profile, { recursive: true, force: true }); await rm(extraction, { recursive: true, force: true });
}
