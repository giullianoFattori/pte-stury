import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { verifyGenerated } from '../tools/content/verify.mjs';
import { jsonBytes } from '../tools/content/canonicalize.mjs';
import { validateAudioAssets } from '../tools/content/audio-integrity.mjs';
import { createAudioMedia } from '../tools/content/media-probe.mjs';
import { configurePackagedLibraries } from '../runtime/src/nativeProcess.mjs';

// Build-time only. The packaged runtime needs neither TS authoring tools nor crypto discovery.
export async function stageGeneratedContent(packageRoot, sourceRoot = resolve('src/generated')) {
  const { bundle, manifest } = await verifyGenerated(sourceRoot);
  if (bundle.items.some(item => item.audio)) {
    const nativeRoot = join(packageRoot, 'native'), suffix = process.platform === 'win32' ? '.exe' : '';
    configurePackagedLibraries(nativeRoot);
    const media = await createAudioMedia({ ffmpeg: join(nativeRoot, 'ffmpeg' + suffix), ffprobe: join(nativeRoot, 'ffprobe' + suffix) });
    const audio = await validateAudioAssets(bundle.items, { audioRoot: join(packageRoot, 'web/audio'), media, reportOrphans: false });
    if (audio.errors.length) throw new Error('Staged question audio failed integrity validation.');
  }
  const target = join(packageRoot, 'web/content');
  await mkdir(target, { recursive: true });
  await writeFile(join(target, 'question-bank.json'), jsonBytes(bundle));
  await writeFile(join(target, 'question-bank.manifest.json'), jsonBytes(manifest));
  return manifest;
}
