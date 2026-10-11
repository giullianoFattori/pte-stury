import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, copyFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildBank } from '../../tools/content/build.mjs';
import { stageGeneratedContent } from '../content.mjs';

test('staging checks actual owned audio before publishing generated catalog files', { skip: process.platform !== 'linux' }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'pte-package-content-audio-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const generated = join(root, 'generated'), packageRoot = join(root, 'package');
  const result = await buildBank({ sourceRoot: resolve('tests/fixtures/content-build/valid'), outputRoot: generated,
    audioOptions: { audioRoot: resolve('tests/fixtures/audio/valid'), reportOrphans: false } });
  for (const dir of ['native', 'web/audio/wfd', 'web/audio/rs']) await mkdir(join(packageRoot, dir), { recursive: true });
  for (const name of ['ffmpeg', 'ffprobe']) {
    await copyFile('/usr/bin/' + name, join(packageRoot, 'native', name));
    await chmod(join(packageRoot, 'native', name), 0o700);
  }
  await assert.rejects(stageGeneratedContent(packageRoot, generated), /Staged question audio failed/);
  for (const item of result.bundle.items.filter(item => item.audio))
    await copyFile('tests/fixtures/audio/valid/' + item.audio.path.slice('/audio/'.length), join(packageRoot, 'web', item.audio.path.slice(1)));
  const staged = await stageGeneratedContent(packageRoot, generated);
  assert.equal(staged.contentVersion, result.manifest.contentVersion);
  await writeFile(join(packageRoot, 'web/audio/rs/rs-000001.mp3'), 'tampered');
  await assert.rejects(stageGeneratedContent(packageRoot, generated), /Staged question audio failed/);
});
