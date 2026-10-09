import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform, arch, release, cpus, totalmem } from 'node:os';
import { runNative } from '../../runtime/src/nativeProcess.mjs';
import { hashFile } from '../speech-benchmark/models.mjs';
import { ENGINE_REVISION, ENGINE_VERSION } from '../../runtime/src/version.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
async function command(executable, args) {
  const bytes = await runNative(executable, args, { signal: new AbortController().signal, timeoutMs: 10000,
    unavailable: () => new Error('Audit prerequisite unavailable'), failed: () => new Error('Audit failed'), timeout: () => new Error('Audit deadline') });
  return bytes.toString('utf8').trim();
}
const checkout = join(root, '.local-runtime/whisper.cpp'), cache = await readFile(join(checkout, 'build/CMakeCache.txt'), 'utf8');
if (await command('/usr/bin/git', ['-C', checkout, 'rev-parse', 'HEAD']) !== ENGINE_REVISION) throw new Error('Unexpected engine revision.');
const artifact = async (id, path) => ({ id, bytes: (await stat(path)).size, sha256: (await hashFile(path)).sha256 });
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
const dependencies = Object.fromEntries(['react', 'react-dom', 'react-router-dom', 'dexie', 'vite', 'typescript', 'oxlint', '@vitejs/plugin-react'].map(name => [name, lock.packages['node_modules/' + name].version]));
const ffmpeg = await command('/usr/bin/ffmpeg', ['-version']);
const audit = JSON.parse(await readFile('/tmp/pte-0508-npm-audit.json', 'utf8'));
const result = {
  createdAt: new Date().toISOString(), measuredGitSha: await command('/usr/bin/git', ['-C', root, 'rev-parse', 'HEAD']),
  workingTreeDirty: Boolean(await command('/usr/bin/git', ['-C', root, 'status', '--porcelain'])),
  node: process.version, os: `${platform()} ${release()}`, arch: arch(), cpu: cpus()[0].model,
  logicalCores: cpus().length, ramBytes: totalmem(),
  engine: { version: ENGINE_VERSION, revision: ENGINE_REVISION, buildType: /^CMAKE_BUILD_TYPE:STRING=(.*)$/m.exec(cache)[1],
    compiler: (await command('/usr/bin/c++', ['--version'])).split('\n')[0],
    cmake: (await command(join(root, '.local-runtime/cmake-package/cmake/data/bin/cmake'), ['--version'])).split('\n')[0],
    backendFlags: Object.fromEntries([...cache.matchAll(/^(GGML_[A-Z0-9_]+):BOOL=(ON|OFF)$/gm)].map(match => [match[1], match[2]])),
    cxxFlags: /^CMAKE_CXX_FLAGS:STRING=(.*)$/m.exec(cache)?.[1],
    sourceDiffSha256: createHash('sha256').update(await command('/usr/bin/git', ['-C', checkout, 'diff', '--binary'])).digest('hex') },
  ffmpeg: { version: ffmpeg.split('\n')[0], builtWith: ffmpeg.split('\n').find(line => line.startsWith('built with')),
    enablesGpl: ffmpeg.includes('--enable-gpl'), enablesNonfree: ffmpeg.includes('--enable-nonfree') },
  artifacts: await Promise.all([artifact('whisper-cli', join(checkout, 'build/bin/whisper-cli')),
    artifact('ffmpeg', '/usr/bin/ffmpeg'), artifact('ffprobe', '/usr/bin/ffprobe'), artifact('base.en', join(root, '.local-runtime/models/ggml-base.en.bin'))]),
  dependencies, npmAudit: { vulnerabilities: audit.metadata.vulnerabilities, dependencyCounts: audit.metadata.dependencies,
    limitation: 'npm known-advisory snapshot only; excludes Node/native/system dependency CVE attestation.' },
  notes: ['Development provenance snapshot, not an authenticated shipped manifest.', 'No host/usernames, private paths, audio or transcript included.',
    'The measured revision predates the final hardening commit; dirty state is explicit. Re-run after release builds.']
};
await writeFile(new URL('../../runtime/docs/audits/build-dependencies-05.08.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ event: 'build dependency audit saved', npmAdvisories: audit.metadata.vulnerabilities.total }));
