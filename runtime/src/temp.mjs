import { mkdir, lstat, opendir, rm, mkdtemp, open, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function privateDirectory(path) {
  await mkdir(path, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && (stat.uid !== process.getuid() || (stat.mode & 0o077)))) throw new Error('Unsafe temporary namespace');
}

async function acquireLock(root) {
  const lock = join(root, 'instance.lock');
  try { await mkdir(lock, { mode: 0o700 }); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    await privateDirectory(lock);
    const file = await open(join(lock, 'pid'), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    let pid;
    try {
      const bytes = Buffer.alloc(32);
      const info = await file.stat();
      if (!info.isFile() || info.size > 31) throw new Error('Invalid instance lock');
      const { bytesRead } = await file.read(bytes, 0, 32, 0);
      const value = bytes.subarray(0, bytesRead).toString();
      if (!/^[1-9][0-9]{0,9}$/.test(value)) throw new Error('Invalid instance lock');
      pid = Number(value);
    } finally { await file.close(); }
    try { process.kill(pid, 0); throw new Error('Temporary namespace is in use'); } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    // Only a confirmed dead owner can be reclaimed. PID reuse fails closed.
    await rm(lock, { recursive: true });
    await mkdir(lock, { mode: 0o700 });
  }
  await writeFile(join(lock, 'pid'), String(process.pid), { flag: 'wx', mode: 0o600 });
  return () => rm(lock, { recursive: true });
}

// Bind first to reject port collisions, then obtain a namespace lock which stays
// held even after the listener closes, until native work and cleanup finish.
export async function createTempStore(port, base = tmpdir()) {
  const parent = join(base, `pte-study-runtime-${process.getuid?.() ?? 'user'}`);
  await privateDirectory(parent);
  const root = join(parent, `port-${port}`);
  await privateDirectory(root);
  const release = await acquireLock(root);
  try {
    let entries = 0;
    const directory = await opendir(root);
    for await (const entry of directory) {
      if (++entries > 256) throw new Error('Temporary namespace entry limit exceeded');
      if (!/^request-[A-Za-z0-9]{6}$/.test(entry.name)) continue;
      // rm unlinks symlinks, including links inside a directory; it never traverses
      // their targets. Only generated request names in this private root qualify.
      await rm(join(root, entry.name), { recursive: true, force: true });
    }
    return {
      root, close: release,
      async create() {
        const path = await mkdtemp(join(root, 'request-'));
        return { path, inputPath: join(path, 'input.bin'), normalizedPath: join(path, 'normalized.wav'),
          async remove() { await rm(path, { recursive: true, force: true }); } };
      },
    };
  } catch (error) { await release(); throw error; }
}
