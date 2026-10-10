import { mkdir, lstat, writeFile, readdir, rename, rm } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { assertDirectory } from './discover.mjs';
import { verifyGenerated, GENERATED_FILES } from './verify.mjs';
import { readSource } from './read-source.mjs';

async function exists(path) { try { await lstat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
// Developer build lock; PID reuse remains a conservative stale-lock ambiguity.
async function acquire(lock) {
  try { await mkdir(lock, { mode: 0o700 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    await assertDirectory(lock);
    if ((await readdir(lock)).join(',') !== 'owner.json') throw new Error('Invalid build lock');
    const stat = await lstat(join(lock, 'owner.json'));
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256) throw new Error('Invalid build lock');
    const owner = JSON.parse(await readSource(join(lock, 'owner.json'), 256));
    if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error('Invalid build lock owner');
    try { process.kill(owner.pid, 0); throw new Error('Content build already locked'); }
    catch (probe) { if (probe.code !== 'ESRCH') throw probe; }
    await rm(lock, { recursive: true });
    await mkdir(lock, { mode: 0o700 });
  }
  try { await writeFile(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid }), { flag: 'wx', mode: 0o600 }); }
  catch (error) { await rm(lock, { recursive: true }); throw error; }
}
export async function installGenerated(result, outputRoot, { move = rename } = {}) {
  const parent = dirname(outputRoot), name = basename(outputRoot);
  await mkdir(parent, { recursive: true }); await assertDirectory(parent);
  const lock = join(parent, '.' + name + '.content-lock'), previous = join(parent, '.' + name + '.content-previous');
  await acquire(lock);
  const next = join(parent, '.' + name + '.content-next');
  let stage, movedOld = false, installed = false;
  try {
    // Recover a crash between directory renames. Never trust unverified leftovers.
    if (await exists(previous)) {
      await verifyGenerated(previous);
      if (!await exists(outputRoot)) await rename(previous, outputRoot);
      else { await verifyGenerated(outputRoot); await rm(previous, { recursive: true }); }
    }
    if (await exists(outputRoot)) await verifyGenerated(outputRoot);
    // A crashed writer may leave a partial next pair. Remove only these known regular files.
    if (await exists(next)) {
      await assertDirectory(next);
      for (const file of await readdir(next)) {
        const stat = await lstat(join(next, file));
        if (!GENERATED_FILES.includes(file) || !stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe stale build staging directory');
      }
      await rm(next, { recursive: true });
    }
    await mkdir(next, { mode: 0o700 }); stage = next;
    await writeFile(join(stage, GENERATED_FILES[0]), result.bundleBytes, { flag: 'wx' });
    await writeFile(join(stage, GENERATED_FILES[1]), result.manifestBytes, { flag: 'wx' });
    await verifyGenerated(stage);
    if (await exists(outputRoot)) { await move(outputRoot, previous); movedOld = true; }
    try { await move(stage, outputRoot); installed = true; }
    catch (error) { if (movedOld) { await rename(previous, outputRoot); movedOld = false; } throw error; }
    if (movedOld) { await rm(previous, { recursive: true }); movedOld = false; }
  } finally {
    if (stage && !installed) await rm(stage, { recursive: true, force: true });
    await rm(lock, { recursive: true });
  }
}
