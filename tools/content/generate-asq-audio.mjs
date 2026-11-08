import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';

const run = promisify(execFile), sourceRoot = resolve('content/answer-short-question');
const audioRoot = resolve('public/audio/answer-short-question'), tempRoot = resolve('.local-content/asq-audio');
await mkdir(audioRoot, { recursive: true }); await mkdir(tempRoot, { recursive: true });
for (const name of (await readdir(sourceRoot)).filter(value => /^asq-\d{6}\.json$/.test(value)).sort()) {
  const file = join(sourceRoot, name), item = JSON.parse(await readFile(file, 'utf8'));
  const text = join(tempRoot, `${item.id}.txt`), wav = join(tempRoot, `${item.id}.wav`), mp3 = join(audioRoot, `${item.id}.mp3`);
  await writeFile(text, item.taskData.questionTranscript);
  await run('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', `flite=textfile=${item.id}.txt:voice=slt`, '-af', 'apad=pad_dur=1.2', '-t', '9', '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', '-y', wav], { cwd: tempRoot });
  await run('ffmpeg', ['-nostdin', '-v', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-q:a', '4', '-y', mp3]);
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', mp3]);
  const bytes = await readFile(mp3), durationMs = Math.round(Number(stdout.trim()) * 1000);
  if (durationMs < 3000 || durationMs > 9000) throw new Error(`${item.id} duration outside 3–9 seconds: ${durationMs}`);
  item.taskData.audio = { path: `/audio/answer-short-question/${item.id}.mp3`, durationMs, mimeType: 'audio/mpeg', sha256: createHash('sha256').update(bytes).digest('hex') };
  await writeFile(file, `${JSON.stringify(item, null, 2)}\n`);
}
await rm(tempRoot, { recursive: true, force: true });
console.log('Generated six local Answer Short Question prompt audios.');
