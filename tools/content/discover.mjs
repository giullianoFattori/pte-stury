import { lstat, opendir, realpath } from 'node:fs/promises';
import { join, resolve, relative, sep } from 'node:path';
import { TASK_ORDER, compare } from './canonicalize.mjs';
import { CONTENT_LIMITS } from '../../src/domain/content/validationPolicy.ts';

const IGNORED_FILES = new Set(['.gitkeep', '.DS_Store', 'Thumbs.db']);
export class BuildError extends Error {
  constructor(errors, warnings = []) { super('Content build failed; no new output produced.'); this.errors = errors; this.warnings = warnings; }
}
export const issue = (file, code, message, path = '$') => ({ file, path, code, message });
export async function assertDirectory(path) {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(path) !== resolve(path)) throw new Error('Directory must not contain symlink components');
}
export async function discover(sourceRoot) {
  const files = [], errors = [];
  let visited = 0;
  try { await assertDirectory(sourceRoot); }
  catch { throw new BuildError([issue('content', 'UNSAFE_SOURCE_ROOT', 'Content root must be an existing directory without symlinks.')]); }
  async function visit(path, task, depth) {
    const name = 'content/' + relative(sourceRoot, path).split(sep).join('/');
    if (++visited > CONTENT_LIMITS.batchItems * 4 || depth > 16) throw new BuildError([issue(name, 'DISCOVERY_LIMIT', 'Source discovery budget exceeded.')]);
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) { errors.push(issue(name, 'SYMLINK_SOURCE', 'Symlink sources are forbidden.')); return; }
    if (stat.isDirectory()) {
      await assertDirectory(path);
      const names = [];
      for await (const entry of await opendir(path)) {
        if (names.length >= CONTENT_LIMITS.batchItems * 4) throw new BuildError([issue(name, 'DISCOVERY_LIMIT', 'Directory entry budget exceeded.')]);
        names.push(entry.name);
      }
      names.sort(compare);
      for (const child of names) await visit(join(path, child), task, depth + 1);
    } else if (!stat.isFile()) errors.push(issue(name, 'INVALID_SOURCE_FILE', 'Source must be a regular JSON file.'));
    else if (IGNORED_FILES.has(name.split('/').at(-1))) return;
    else if (!name.endsWith('.json')) errors.push(issue(name, 'UNEXPECTED_SOURCE_FILE', 'Only .json and explicitly allowed system files are permitted.'));
    else {
      if (files.length >= CONTENT_LIMITS.batchItems) throw new BuildError([issue(name, 'DISCOVERY_LIMIT', 'Item count budget exceeded.')]);
      files.push({ path, file: name, task });
    }
  }
  for (const task of TASK_ORDER) {
    try { await assertDirectory(join(sourceRoot, task)); await visit(join(sourceRoot, task), task, 0); }
    catch (error) {
      if (error instanceof BuildError) throw error;
      errors.push(issue('content/' + task, 'UNSAFE_TASK_DIRECTORY', 'Registered task directory is missing, unreadable or unsafe.'));
    }
  }
  if (errors.length) throw new BuildError(errors.sort((a, b) => compare(a.file, b.file)));
  return files.sort((a, b) => compare(a.file, b.file));
}
