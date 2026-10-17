// Sequential checks avoid shared Vite optimizer/npm state races. Packaging is opt-in/separate.
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const createdAt = new Date().toISOString();
const gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const gitDirty = Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim());
const logRoot = '.local-packaging/session-validation/logs';
await mkdir(logRoot, { recursive: true });
const checks = [];
const baseAudit = { activity: '07', step: '07.10', createdAt, gitCommit, gitDirty, platform: `${process.platform}-${process.arch}` };
await mkdir('audits', { recursive: true });
await writeFile('audits/session-07.10-browser-closure.json', JSON.stringify({ ...baseAudit, status: 'PENDING', checks }, null, 2) + '\n');
async function check(name, args) {
  const child = spawn('npm', args, { shell: false, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; child.stdout.on('data', data => { log += data; }); child.stderr.on('data', data => { log += data; });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  await writeFile(`${logRoot}/${name}.log`, log);
  checks.push({ command: `npm ${args.join(' ')}`, status: code === 0 ? 'PASS' : 'FAIL' });
  console.log(JSON.stringify(checks.at(-1)));
  if (code !== 0) {
    await writeFile('audits/session-07.10-browser-closure.json', JSON.stringify({ ...baseAudit, status: 'FAIL', finishedAt: new Date().toISOString(), checks }, null, 2) + '\n');
    throw new Error(`Closure check failed: ${name}; see ${logRoot}/${name}.log`);
  }
  return log;
}
for (const command of ['content:validate', 'content:build', 'content:verify', 'content:verify-audio']) await check(command.replaceAll(':', '-'), ['run', command]);
const tests = await check('tests', ['test']);
await check('build', ['run', 'build']); await check('lint', ['run', 'lint']);
const packages = await check('package-tests', ['run', 'package:test']);
const suites = [
  ['exercise-session', 'session-07.04-browser.json'], ['quick-practice', 'session-07.05-browser.json'],
  ['task-practice', 'session-07.06-browser.json'], ['mixed-practice', 'session-07.07-browser.json'],
  ['session-navigation', 'session-07.08-browser.json'], ['session-summary', 'session-07.09-browser.json'],
];
const evidence = [];
for (const [suite, file] of suites) {
  await check(suite, ['run', `test:${suite}-browser`]);
  const audit = JSON.parse(await readFile(`audits/${file}`, 'utf8'));
  if (audit.status !== 'PASS' || audit.pageErrors !== 0 || (audit.remoteRequests ?? audit.unexpectedRemoteRequests ?? audit.unexpectedNetworkRequests) !== 0)
    throw new Error('Browser audit failed closure invariants');
  evidence.push({ path: `audits/${file}`, status: audit.status, browser: audit.browser });
}
execFileSync('git', ['diff', '--check']);
const manifest = JSON.parse(await readFile('src/generated/question-bank.manifest.json', 'utf8'));
const count = log => Number(log.match(/(?:ℹ\s*)?tests (\d+)/)?.[1]);
if (!count(tests) || !count(packages)) throw new Error('Test counts unavailable');
const audit = { status: 'PASS', activity: '07', step: '07.10', createdAt, finishedAt: new Date().toISOString(), gitCommit, gitDirty,
  platform: `${process.platform}-${process.arch}`, browser: evidence[0].browser, contentVersion: manifest.contentVersion,
  scope: 'Linux host development browser; actual app/IndexedDB/MediaRecorder/Web Audio, controlled local STT HTTP; no physical microphone, human model-quality or clean-machine certification',
  testCounts: { applicationRuntime: count(tests), package: count(packages) }, checks, evidence,
  standaloneTasks: 'PASS', quickPractice: 'PASS', taskPractice: 'PASS', mixedPractice: 'PASS', navigation: 'PASS', summary: 'PASS',
  pageErrors: 0, unexpectedRemoteRequests: 0, dexieVersion: 3, packagedProduct: 'separate audits/session-07.10-package.json',
  readiness: 'Bounded Vite module graph warmup and HTTP HTML probe before browser; no automatic product assertion retries' };
await mkdir('audits', { recursive: true });
await writeFile('audits/session-07.10-browser-closure.json', JSON.stringify(audit, null, 2) + '\n');
console.log(JSON.stringify({ status: audit.status, testCounts: audit.testCounts, suites: evidence.length }));
