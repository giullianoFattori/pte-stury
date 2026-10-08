import { readFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { MAX_BYTES, withNormalizedAudio, inferWav } from './audio.mjs';
import { measureWordErrors, comparePocResponse } from '../../../src/infrastructure/speech/whisperPocEvaluation.ts';

const [input, referencePath, task = 'ra', model = 'base.en', transport = 'cli', expectedPath] = process.argv.slice(2);
if (!input || !referencePath || !['ra', 'rs'].includes(task) || !['base.en', 'small.en'].includes(model) || !['cli', 'server'].includes(transport)) {
  console.error('Usage: transcribe-test.sh AUDIO MANUAL_REFERENCE.txt [ra|rs] [base.en|small.en] [cli|server] [EXPECTED_PTE.txt]');
  process.exit(1);
}
// Server model is selected at launch, so the caller must confirm it when using server mode.
if (transport === 'server') console.error(`Verify whisper-server was launched with ${model}; this tool cannot attest its loaded model.`);
const root = fileURLToPath(new URL('../../../', import.meta.url));
if ((await stat(input)).size > MAX_BYTES) throw new Error('Audio exceeds 12 MiB.');
const reference = (await readFile(referencePath, 'utf8')).trim();
const expected = expectedPath ? (await readFile(expectedPath, 'utf8')).trim() : reference;
const started = performance.now();
const result = await withNormalizedAudio(await readFile(input), async ({ wav, directory, duration, bytes }) => {
  let text;
  let inferenceSeconds;
  if (transport === 'server') {
    ({ text, inferenceSeconds } = await inferWav(bytes));
  } else {
    const inferenceStarted = performance.now();
    const output = join(directory, 'transcript');
    await promisify(execFile)(join(root, '.local-runtime/whisper.cpp/build/bin/whisper-cli'),
      ['-m', join(root, `.local-runtime/models/ggml-${model}.bin`), '-f', wav, '-l', 'en', '-ng', '-t', '4', '-otxt', '-of', output],
      { timeout: 180000, maxBuffer: 1024 * 1024 });
    inferenceSeconds = (performance.now() - inferenceStarted) / 1000;
    text = (await readFile(`${output}.txt`, 'utf8')).trim();
  }
  return { model, transport, reference, rawTranscript: text, ...measureWordErrors(reference, text),
    audioSeconds: duration, inferenceSeconds, realTimeFactor: inferenceSeconds / duration,
    pteComparison: comparePocResponse(task, expected, text) };
});
console.log(JSON.stringify({ ...result, totalSeconds: (performance.now() - started) / 1000 }, null, 2));
