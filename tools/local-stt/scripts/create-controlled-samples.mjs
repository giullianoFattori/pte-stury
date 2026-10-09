import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readAloudQuestions } from '../../../src/data/question-bank/read-aloud.ts';
import { repeatSentenceQuestions } from '../../../src/data/question-bank/repeat-sentence.ts';

// Technical fixtures only: synthetic flite speech, never label these learner recordings.
const output = fileURLToPath(new URL('../tmp/controlled/', import.meta.url));
await mkdir(output, { recursive: true });
const cases = [
  ['RA-1', 'ra', readAloudQuestions[0]], ['RA-2', 'ra', readAloudQuestions[4]],
  ['RA-3', 'ra', readAloudQuestions[5]], ['RA-M', 'ra', readAloudQuestions[2]],
  ['RS-1', 'rs', repeatSentenceQuestions[0]], ['RS-2', 'rs', repeatSentenceQuestions[2]],
  ['RS-3', 'rs', repeatSentenceQuestions[4]],
];
for (const [id, task, item] of cases) {
  await writeFile(join(output, `${id}.txt`), item.transcript);
  // Controlled filenames; no browser-supplied strings in filter expressions.
  await promisify(execFile)('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', `flite=textfile=${id}.txt:voice=slt`,
    '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-y', `${id}.wav`], { cwd: output });
  console.log(`${id}: ${task} / ${item.id} / synthetic flite slt`);
}

await promisify(execFile)('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i',
  'anullsrc=r=16000:cl=mono', '-t', '3', '-c:a', 'pcm_s16le', '-y', 'SILENCE.wav'], { cwd: output });
