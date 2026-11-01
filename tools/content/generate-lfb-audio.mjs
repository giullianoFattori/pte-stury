import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';

// Locally synthesized original practice narration (FFmpeg flite voice slt).
// This is learner content, not evidence of human or Pearson-equivalent speech quality.
const run = promisify(execFile);
const root = resolve('content/listening-fill-blanks-type-in');
const audioRoot = resolve('public/audio/listening-fill-blanks-type-in');
const tempRoot = resolve('.local-content/language-audio');
await mkdir(audioRoot, { recursive: true });
await mkdir(tempRoot, { recursive: true });
for (const name of await readdir(root)) {
  if (!/^lfb-\d{6}\.json$/.test(name)) continue;
  const item = JSON.parse(await readFile(join(root, name), 'utf8'));
  const text = item.taskData.transcriptSegments.map((segment, index) => segment + (item.taskData.blanks[index]?.answer ?? '')).join('');
  const id = item.id;
  await writeFile(join(tempRoot, `${id}.txt`), text);
  const wav = join(tempRoot, `${id}.wav`);
  await run('ffmpeg', ['-nostdin','-v','error','-f','lavfi','-i',`flite=textfile=${id}.txt:voice=slt`,'-ar','24000','-ac','1','-c:a','pcm_s16le','-y',wav], { cwd: tempRoot });
  await run('ffmpeg', ['-nostdin','-v','error','-i',wav,'-codec:a','libmp3lame','-q:a','4','-y',join(audioRoot,`${id}.mp3`)]);
  await rm(wav);
  console.log(`Generated local voice audio for ${id}.`);
}
await rm(tempRoot, { recursive: true, force: true });
