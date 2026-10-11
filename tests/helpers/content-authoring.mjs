import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initialRegistry } from '../../tools/content/ids.mjs';
import { TASK_ORDER } from '../../tools/content/canonicalize.mjs';
export async function authorRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'pte-content-author-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const task of TASK_ORDER) await mkdir(join(root, task));
  await writeFile(join(root, 'id-registry.json'), JSON.stringify(initialRegistry(), null, 2) + '\n');
  return root;
}
export const record = (extra = {}) => ({ taskType: 'read-aloud', difficulty: 2, prompt: 'An authored draft.', ...extra });
export async function snapshot(root) {
  const files = {};
  async function walk(directory, prefix = '') {
    for (const name of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const key = prefix + name.name;
      if (name.isDirectory()) await walk(join(directory, name.name), key + '/');
      else files[key] = await readFile(join(directory, name.name), 'utf8');
    }
  }
  await walk(root); return files;
}
export const rejectsAuthor = async (work, code) => {
  const { default: assert } = await import('node:assert/strict');
  await assert.rejects(work, error => (error.issues ?? error.errors)?.some(issue => issue.code === code));
};
