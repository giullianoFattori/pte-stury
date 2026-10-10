import { validateArtifactManifest, verifyArtifactManifest } from './artifactManifest.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createWhisperService, MODEL_MANIFEST } from './whisper.mjs';
import { createStaticServer } from './static.mjs';
const TARGETS = { 'linux-x64': ['linux', 'x64'], 'windows-x64': ['win32', 'x64'], 'macos-x64': ['darwin', 'x64'], 'macos-arm64': ['darwin', 'arm64'] };
export function validatePackageManifest(manifest) {
  validateArtifactManifest(manifest);
  if (manifest.packageVersion !== 1 || manifest.appVersion !== '0.1.0' || manifest.runtimeVersion !== '0.1.0'
    || manifest.apiVersion !== 1 || manifest.engineVersion !== '1.8.3' || manifest.nodeVersion !== '24.21.0'
    || manifest.modelId !== 'base.en' || manifest.origin !== 'http://127.0.0.1:8765'
    || !TARGETS[manifest.target] || TARGETS[manifest.target][0] !== manifest.platform || TARGETS[manifest.target][1] !== manifest.arch) throw new Error('Unsupported package metadata');
  const paths = new Set(manifest.artifacts.map(entry => entry.path));
  const suffix = manifest.platform === 'win32' ? '.exe' : '';
  for (const path of [`launcher${suffix}`, `native/node${suffix}`, `native/whisper-cli${suffix}`, `native/ffmpeg${suffix}`, `native/ffprobe${suffix}`,
    'runtime/packaged.mjs', 'runtime/main.mjs', 'web/index.html', 'models/ggml-base.en.bin', 'manifest/whisper-config.cmake', 'manifest/build.json', 'manifest/sbom.cdx.json', 'licenses/NOTICE.txt']) {
    if (!paths.has(path)) throw new Error('Incomplete package inventory');
  }
  if (manifest.platform === 'linux') for (const name of ['libstdc++.so.6','libgcc_s.so.1','libavcodec.so.62','libavdevice.so.62','libavfilter.so.11','libavformat.so.62','libavutil.so.60','libswresample.so.6','libswscale.so.9']) if (!paths.has('native/'+name)) throw new Error('Missing owned library');
  return manifest;
}

export async function resolvePackagedResources(root) {
  const manifest = validatePackageManifest(JSON.parse(await readFile(join(root, 'manifest/package.json'), 'utf8')));
  if (manifest.platform !== process.platform || manifest.arch !== process.arch || process.versions.node !== manifest.nodeVersion) throw new Error('Wrong package target');
  await verifyArtifactManifest(manifest, root);
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const model = manifest.artifacts.find(entry => entry.path === 'models/ggml-base.en.bin');
  if (model.sha256 !== MODEL_MANIFEST['base.en'].sha256) throw new Error('Untrusted model');
  const artifacts = { executable: join(root, `native/whisper-cli${suffix}`), buildInfo: join(root, 'manifest/whisper-config.cmake'),
    modelRoot: join(root, 'models'), models: MODEL_MANIFEST };
  return { serveStatic: await createStaticServer(join(root, 'web'), manifest.artifacts),
    preprocessOptions: { tools: { ffmpeg: join(root, `native/ffmpeg${suffix}`), ffprobe: join(root, `native/ffprobe${suffix}`) } },
    initializeEngine: options => createWhisperService({ ...options, artifacts }) };
}
