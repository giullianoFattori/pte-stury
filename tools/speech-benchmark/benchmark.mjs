import { readFile, writeFile, mkdir, mkdtemp, rm, stat, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir, cpus, totalmem, platform, arch, release } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { preprocessAudio } from '../../runtime/src/preprocess.mjs';
import { DEVELOPMENT_ARTIFACTS, whisperArguments } from '../../runtime/src/whisper.mjs';
import { ENGINE_VERSION, ENGINE_REVISION } from '../../runtime/src/version.mjs';
import { loadManifest } from './manifest.mjs';
import { verifyModel, hashFile } from './models.mjs';
import { measureProcess } from './process.mjs';
import { measureWordErrors, BENCHMARK_NORMALIZATION_VERSION, representationDifferences, median } from './metrics.mjs';
import { summarize, markdown } from './report.mjs';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const config = JSON.parse(await readFile(new URL('./config.json', import.meta.url), 'utf8'));
async function command(executable, args) {
  return (await run(executable, args, { cwd: ROOT, timeout: 10000, maxBuffer: 1024 * 1024 })).stdout.trim();
}
async function hardware() {
  let physicalCores = null;
  try {
    const rows = await command('lscpu', ['-p=CORE,SOCKET']);
    physicalCores = new Set(rows.split('\n').filter(row => row && !row.startsWith('#'))).size;
  } catch { /* Explicitly unavailable on other platforms. */ }
  return { cpu: cpus()[0]?.model ?? 'unknown', physicalCores, logicalCores: cpus().length, ramBytes: totalmem(),
    os: `${platform()} ${release()}`, arch: arch() };
}
async function engine() {
  const checkout = join(ROOT, '.local-runtime/whisper.cpp');
  const revision = await command('git', ['-C', checkout, 'rev-parse', 'HEAD']);
  const info = await readFile(DEVELOPMENT_ARTIFACTS.buildInfo, 'utf8');
  if (revision !== ENGINE_REVISION || !info.includes(`set(WHISPER_VERSION      ${ENGINE_VERSION})`)
    || !info.includes(`set(WHISPER_BUILD_COMMIT ${ENGINE_REVISION.slice(0, 7)})`)) throw new Error('Pinned engine/build unavailable. Run setup-models.sh.');
  const cache = await readFile(join(checkout, 'build/CMakeCache.txt'), 'utf8');
  const buildType = /^CMAKE_BUILD_TYPE:STRING=(.*)$/m.exec(cache)?.[1] ?? 'unknown';
  const compilerPath = /^CMAKE_CXX_COMPILER:FILEPATH=(.*)$/m.exec(cache)?.[1];
  const compiler = compilerPath ? (await command(compilerPath, ['--version'])).split('\n')[0] : 'unknown';
  return { version: ENGINE_VERSION, revision, buildType, compiler,
    sourceDirty: Boolean(await command('git', ['-C', checkout, 'status', '--porcelain'])),
    sourceDiffSha256: (await import('node:crypto')).createHash('sha256').update(await command('git', ['-C', checkout, 'diff', '--binary'])).digest('hex'),
    executableSha256: (await hashFile(DEVELOPMENT_ARTIFACTS.executable)).sha256,
    buildCacheSha256: (await hashFile(join(checkout, 'build/CMakeCache.txt'))).sha256 };
}

// Internal dependency seam for orchestrator tests; CLI exposes no artifact overrides.
export async function benchmark({ manifestPath, corpusRoot, outputRoot, signal }, dependencies = {}) {
  const verify = dependencies.verifyModel ?? verifyModel;
  const hash = dependencies.hashFile ?? hashFile;
  const preprocess = dependencies.preprocessAudio ?? preprocessAudio;
  const measure = dependencies.measureProcess ?? measureProcess;
  const manifest = await loadManifest(manifestPath, corpusRoot);
  if (!manifest.samples.some(row => row.usable !== false)) throw new Error('No usable recordings. Add human recordings and verified references.');
  const result = { benchmarkVersion: 1, normalizationVersion: BENCHMARK_NORMALIZATION_VERSION, createdAt: new Date().toISOString(),
    config, git: { sha: await command('git', ['rev-parse', 'HEAD']), dirty: Boolean(await command('git', ['status', '--porcelain'])) },
    hardware: await hardware(), engine: await (dependencies.engine ?? engine)(), models: {}, samples: [],
    corpus: { speakerCount: new Set(manifest.samples.filter(row => row.usable !== false && row.task !== 'noise').map(row => row.notes.speaker)).size,
      samples: manifest.samples.map(row => ({ id: row.id, task: row.task, usable: row.usable !== false,
        l1: row.notes?.l1, environment: row.notes?.environment, pace: row.notes?.pace, noiseType: row.noiseType })) } };
  for (const model of config.models) {
    try { result.models[model] = { status: 'ok', ...await verify(model) }; }
    catch { result.models[model] = { id: model, status: 'failed', error: 'MODEL_UNAVAILABLE_OR_INVALID' }; }
  }
  await mkdir(outputRoot, { recursive: true, mode: 0o700 });
  // Unique run directory: existing reports are never overwritten.
  const output = await mkdtemp(join(outputRoot, 'run-'));
  const save = async () => {
    const summary = summarize(result);
    await writeFile(join(output, 'results.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
    await writeFile(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { mode: 0o600 });
    await writeFile(join(output, 'summary.md'), markdown(summary), { mode: 0o600 });
  };
  for (const sample of manifest.samples) {
    signal.throwIfAborted();
    const temporary = await mkdtemp(join(tmpdir(), 'pte-benchmark-'));
    let audio, preprocessingError, sourceSha256, normalizedSha256;
    try {
      if (sample.usable !== false) {
        try {
          const source = resolve(corpusRoot, sample.audioFile);
          if ((await stat(source)).size > config.maxUploadBytes) throw Object.assign(new Error(), { code: 'AUDIO_TOO_LARGE' });
          sourceSha256 = (await hash(source)).sha256;
          // Production decoder reads a private snapshot; original learner audio stays read-only.
          const inputPath = join(temporary, 'input.bin'), normalizedPath = join(temporary, 'normalized.wav');
          await copyFile(source, inputPath);
          if ((await hash(inputPath)).sha256 !== sourceSha256) throw Object.assign(new Error(), { code: 'SOURCE_CHANGED' });
          audio = await preprocess({ inputPath, normalizedPath }, config, signal);
          normalizedSha256 = (await hash(normalizedPath)).sha256;
        } catch (error) { preprocessingError = error.code ?? 'PREPROCESS_FAILED'; }
      }
      for (const model of config.models) {
        const row = { id: sample.id, task: sample.task, model, sourceSha256, normalizedSha256,
          status: 'failed', runs: [] };
        result.samples.push(row);
        if (sample.usable === false) { row.status = 'excluded'; row.error = 'HUMAN_MARKED_UNUSABLE'; continue; }
        if (preprocessingError || result.models[model].status !== 'ok') { row.error = preprocessingError ?? 'MODEL_UNAVAILABLE_OR_INVALID'; continue; }
        row.audioMs = audio.durationMs; row.preprocessingMs = audio.preprocessingMs;
        row.expectedText = sample.expectedText; row.spokenReference = sample.spokenReference;
        for (let repetition = 1; repetition <= config.repetitions; repetition++) {
          signal.throwIfAborted();
          const measurement = await measure(DEVELOPMENT_ARTIFACTS.executable,
            whisperArguments(join(DEVELOPMENT_ARTIFACTS.modelRoot, result.models[model].filename), audio.normalizedPath),
            { timeoutMs: config.timeoutMs, signal, allowEmpty: sample.task === 'noise' });
          const run = { repetition, ...measurement, rtf: measurement.inferenceMs / audio.durationMs };
          row.runs.push(run);
          if (run.status === 'ok') {
            if (sample.task === 'noise') run.hallucinatedWords = run.transcript.split(/\s+/).filter(Boolean).length;
            else {
              try {
                const metrics = measureWordErrors(sample.spokenReference, run.transcript);
                Object.assign(run, metrics, { referenceWords: metrics.words, representationCount: representationDifferences(metrics).length,
                  representationDifferences: representationDifferences(metrics) });
              } catch { run.status = 'failed'; run.error = 'METRICS_FAILED'; }
            }
          }
        }
        row.transcriptVariants = new Set(row.runs.filter(run => run.status === 'ok').map(run => run.transcript)).size;
        if (row.runs.some(run => run.status !== 'ok')) { row.error = row.runs.find(run => run.status !== 'ok').error; continue; }
        Object.assign(row, row.runs[0], { runs: row.runs, inferenceMs: median(row.runs.map(run => run.inferenceMs)),
          rtf: median(row.runs.map(run => run.rtf)), totalMs: audio.preprocessingMs + median(row.runs.map(run => run.inferenceMs)),
          peakRssBytes: row.runs.some(run => run.peakRssBytes !== null) ? Math.max(...row.runs.map(run => run.peakRssBytes ?? 0)) : null });
      }
    } finally {
      for (const row of result.samples.filter(row => row.id === sample.id && row.status === 'failed')) row.error ??= 'INTERRUPTED_OR_INCOMPLETE';
      await rm(temporary, { recursive: true, force: true }); await save();
    }
  }
  // Recheck artifacts to invalidate measurements if model or executable changed mid-run.
  for (const model of config.models) {
    if (result.models[model].status !== 'ok') continue;
    let valid = false;
    try { valid = (await verify(model)).sha256 === result.models[model].sha256; } catch { /* Invalidates results below. */ }
    let executableValid = false;
    try { executableValid = (await hash(DEVELOPMENT_ARTIFACTS.executable)).sha256 === result.engine.executableSha256; } catch { /* Removed executable invalidates results. */ }
    if (!valid || !executableValid) {
      for (const row of result.samples.filter(row => row.model === model && row.status === 'ok')) { row.status = 'failed'; row.error = 'ARTIFACT_CHANGED'; }
    }
  }
  await save();
  return { output, result };
}

async function main() {
  const args = process.argv.slice(2);
  const local = join(ROOT, '.local-benchmark');
  if (args.length === 1 && args[0] === '--init') {
    await mkdir(join(local, 'corpus/ra'), { recursive: true, mode: 0o700 });
    await mkdir(join(local, 'corpus/rs'), { recursive: true, mode: 0o700 });
    await mkdir(join(local, 'corpus/noise'), { recursive: true, mode: 0o700 });
    await writeFile(join(local, 'references.json'), JSON.stringify({ manifestVersion: 1, samples: [] }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log('Private corpus initialized. Follow tools/speech-benchmark/README.md.');
    return;
  }
  if (args.length) throw new Error('Usage: npm run benchmark:speech [-- --init]');
  const controller = new AbortController();
  const abort = () => controller.abort(new Error('Benchmark interrupted.'));
  process.once('SIGINT', abort); process.once('SIGTERM', abort);
  try {
    const { result } = await benchmark({ manifestPath: join(local, 'references.json'), corpusRoot: join(local, 'corpus'),
      outputRoot: join(local, 'results'), signal: controller.signal });
    console.log(`Benchmark saved in .local-benchmark/results/ (unique run directory). ${summarize(result).gate.recommendation}`);
    if (result.samples.some(row => row.status === 'failed')) process.exitCode = 1;
  } finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.code === 'ENOENT' ? 'Corpus or runtime artifacts missing. Run --init, prepare verified human references and setup-models.sh.' : error.message); process.exitCode = 1; });
}
