// Controlled TTS resource smoke, explicitly not human benchmark/model selection.
import { mkdtemp, rm, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { preprocessAudio } from '../../runtime/src/preprocess.mjs';
import { loadConfig } from '../../runtime/src/config.mjs';
import { DEVELOPMENT_ARTIFACTS, whisperArguments } from '../../runtime/src/whisper.mjs';
import { verifyModel } from '../speech-benchmark/models.mjs';
import { measureProcess } from '../speech-benchmark/process.mjs';
import assert from 'node:assert/strict';
const base = await mkdtemp(join(tmpdir(), 'pte-native-smoke-'));
try {
  const model = await verifyModel('base.en');
  const files = { inputPath: join(base, 'input'), normalizedPath: join(base, 'normalized.wav') };
  await copyFile(fileURLToPath(new URL('../local-stt/tmp/controlled/RA-1.wav', import.meta.url)), files.inputPath);
  const audio = await preprocessAudio(files, await loadConfig(), new AbortController().signal);
  const runs = [];
  for (let repetition = 1; repetition <= 3; repetition++) {
    const result = await measureProcess(DEVELOPMENT_ARTIFACTS.executable,
      whisperArguments(join(DEVELOPMENT_ARTIFACTS.modelRoot, model.filename), audio.normalizedPath),
      { signal: new AbortController().signal, timeoutMs: 60000 });
    assert.equal(result.status, 'ok');
    runs.push({ repetition, inferenceMs: result.inferenceMs, peakWhisperChildRssBytes: result.peakRssBytes, audioMs: audio.durationMs, rtf: result.inferenceMs / audio.durationMs });
  }
  await writeFile(new URL('../../runtime/docs/audits/native-smoke-05.08.json', import.meta.url), JSON.stringify({ controlledTts: true,
    humanBenchmark: false, model: model.id, modelSha256: model.sha256, memoryMethod: 'Child /proc VmHWM sampled every 10ms; lower bound, separate from Node parent RSS.',
    policy: 'Observed baseline smoke only. No final timeout/RAM/model recommendation derived.', runs, passed: true }, null, 2) + '\n');
  console.log(JSON.stringify({ event: 'real base.en resource smoke passed', repetitions: 3 }));
} finally { await rm(base, { recursive: true, force: true }); }
