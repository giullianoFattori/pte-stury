import { readdir, lstat, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyArtifactManifest } from '../runtime/src/artifactManifest.mjs';

import { validatePackageManifest } from '../runtime/src/packageResources.mjs';
export { validatePackageManifest };

export const TARGETS = Object.freeze({ 'linux-x64': ['linux', 'x64'], 'windows-x64': ['win32', 'x64'], 'macos-x64': ['darwin', 'x64'], 'macos-arm64': ['darwin', 'arm64'] });
export async function listFiles(root, prefix = '') {
  const result = [];
  for (const name of (await readdir(join(root, prefix))).sort()) {
    const path = prefix ? `${prefix}/${name}` : name;
    const stat = await lstat(join(root, path));
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw new Error('Non-regular package artifact');
    if (stat.isDirectory()) result.push(...await listFiles(root, path)); else result.push(path);
  }
  return result;
}
function kind(path) {
  if (path.startsWith('web/')) return 'frontend';
  if (path.startsWith('licenses/')) return 'license';
  if (path.startsWith('models/')) return 'model';
  if (/\.(so(\.\d+)*|dylib|dll)$/.test(path)) return 'library';
  if (path.startsWith('runtime/')) return 'runtime';
  if (path.startsWith('manifest/')) return 'metadata';
  return 'executable';
}
export async function generateManifest(root, target) {
  if (!TARGETS[target]) throw new Error('Unsupported target');
  const artifacts = [];
  for (const path of (await listFiles(root)).filter(path => path !== 'manifest/package.json')) {
    const bytes = await readFile(join(root, path));
    artifacts.push({ id: `artifact-${artifacts.length}`, path, kind: kind(path), size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const manifest = { manifestVersion: 1, packageVersion: 1, appVersion: '0.1.0', runtimeVersion: '0.1.0', apiVersion: 1,
    engineVersion: '1.8.3', nodeVersion: '24.21.0', modelId: 'base.en', origin: 'http://127.0.0.1:8765', target,
    platform: TARGETS[target][0], arch: TARGETS[target][1], artifacts };
  validatePackageManifest(manifest);
  await writeFile(join(root, 'manifest/package.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
export async function verifyPackage(root) {
  const manifest = validatePackageManifest(JSON.parse(await readFile(join(root, 'manifest/package.json'), 'utf8')));
  const owned = new Set(manifest.artifacts.map(entry => entry.path));
  const actual = (await listFiles(root)).filter(path => path !== 'manifest/package.json');
  if (actual.length !== owned.size || actual.some(path => !owned.has(path))) throw new Error('Uninventoried package file');
  await verifyArtifactManifest(manifest, root);
  return manifest;
}
