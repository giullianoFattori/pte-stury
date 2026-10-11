import { mkdir, writeFile, lstat, readdir, rm, link } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parseContentJson, parseQuestionBankItemJson } from '../../src/domain/content/validation.ts';
import { canonicalItem, jsonBytes } from './canonicalize.mjs';
import { assertDirectory } from './discover.mjs';
import { readSource } from './read-source.mjs';
import { AuthorError, rejectAuthor } from './author-errors.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = async path => { try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; } };
const sameFile = (a, b) => a.isFile() && b.isFile() && !a.isSymbolicLink() && !b.isSymbolicLink() && a.dev === b.dev && a.ino === b.ino;

export async function recoverAuthorStage(root) {
  const stage = join(root, '.author-stage');
  if (!await exists(stage)) return;
  try {
    await assertDirectory(stage);
    const journal = parseContentJson(await readSource(join(stage, 'journal.json')));
    if (!journal || journal.version !== 1 || Object.keys(journal).sort().join(',') !== 'batchId,entries,historyHash,version'
      || !/^[0-9a-f-]{36}$/.test(journal.batchId) || !Array.isArray(journal.entries) || !journal.entries.length || journal.entries.length > 10000
      || !/^[0-9a-f]{64}$/.test(journal.historyHash)) throw new Error();
    const entries = [], names = new Set(['journal.json', 'history.json']);
    for (const entry of journal.entries) {
      if (!entry || Object.keys(entry).sort().join(',') !== 'id,sha256,taskType' || !/^[0-9a-f]{64}$/.test(entry.sha256)
        || !/^(?:rs|ra|wfd)-(?!000000)[0-9]{6}$/.test(entry.id) || Number(entry.id.slice(-6)) >= 900000
        || !['write-from-dictation', 'repeat-sentence', 'read-aloud'].includes(entry.taskType) || names.has(entry.id + '.json')) throw new Error();
      names.add(entry.id + '.json');
      const staged = join(stage, entry.id + '.json'), target = join(root, entry.taskType, entry.id + '.json');
      await assertDirectory(join(root, entry.taskType));
      const stat = await exists(staged);
      if (stat) {
        const bytes = await readSource(staged), item = parseQuestionBankItemJson(bytes);
        if (hash(bytes) !== entry.sha256 || item.id !== entry.id || item.taskType !== entry.taskType || item.status !== 'draft') throw new Error();
      }
      entries.push({ staged, target, stat });
    }
    const historyPath = join(root, 'import-history');
    const stagedHistory = join(stage, 'history.json'), history = await exists(stagedHistory);
    if (history) {
      const bytes = await readSource(stagedHistory); if (hash(bytes) !== journal.historyHash) throw new Error();
      await assertDirectory(historyPath);
      entries.push({ staged: stagedHistory, target: join(historyPath, journal.batchId + '.json'), stat: history });
    }
    for (const name of await readdir(stage)) if (!names.has(name)) throw new Error();
    // First verify all destinations before removing any. Only exact hardlinks to
    // staged bytes belong to this operation; user edits never get overwritten.
    const owned = [];
    for (const entry of entries) {
      const target = await exists(entry.target);
      if (!target) continue;
      if (!entry.stat || !sameFile(entry.stat, target)) throw new Error();
      owned.push(entry.target);
    }
    for (const target of owned) await rm(target);
    await rm(stage, { recursive: true });
  } catch {
    throw new AuthorError('AUTHOR_RECOVERY_REQUIRED', 'Staging needs explicit inspection; existing source files were preserved.', '$', { recoveryRequired: true });
  }
}
export async function installDraftBatch(root, items, history, commitRegistry, { stageWrite = writeFile, installLink = link, afterRegistry } = {}) {
  const started = performance.now(), timings = {};
  await recoverAuthorStage(root);
  const stage = join(root, '.author-stage');
  const files = items.map(item => ({ item, bytes: jsonBytes(canonicalItem(item)) }));
  const historyBytes = jsonBytes(history);
  const journal = { version: 1, batchId: history.batchId, entries: files.map(({ item, bytes }) => ({ id: item.id, taskType: item.taskType, sha256: hash(bytes) })), historyHash: hash(historyBytes) };
  for (const { item } of files) {
    await assertDirectory(join(root, item.taskType));
    if (await exists(join(root, item.taskType, item.id + '.json'))) rejectAuthor('AUTHOR_FILE_EXISTS', 'Authoring never overwrites an existing destination.');
  }
  await mkdir(join(root, 'import-history'), { recursive: true }); await assertDirectory(join(root, 'import-history'));
  await mkdir(stage, { mode: 0o700 });
  let reserved = false;
  try {
    // Write the complete plan first. Recovery accepts absent files if staging
    // stopped early, but never trusts unexpected names or malformed journal data.
    await writeFile(join(stage, 'journal.json'), jsonBytes(journal), { flag: 'wx', mode: 0o600 });
    for (const { item, bytes } of files) await stageWrite(join(stage, item.id + '.json'), bytes, { flag: 'wx', mode: 0o600 });
    await stageWrite(join(stage, 'history.json'), historyBytes, { flag: 'wx', mode: 0o600 });
    // Validate staged bytes before the irrevocable reservation commit.
    for (const { item, bytes } of files) if (await readSource(join(stage, item.id + '.json')) !== bytes) rejectAuthor('AUTHOR_STAGE_INVALID', 'Staged draft bytes changed.');
    if (await readSource(join(stage, 'history.json')) !== historyBytes) rejectAuthor('AUTHOR_STAGE_INVALID', 'Staged history changed.');
    timings.stageMs = performance.now() - started;
    let phase = performance.now();
    await commitRegistry(); reserved = true; await afterRegistry?.();
    timings.reservationMs = performance.now() - phase; phase = performance.now();
    for (const { item } of files) await installLink(join(stage, item.id + '.json'), join(root, item.taskType, item.id + '.json'));
    await installLink(join(stage, 'history.json'), join(root, 'import-history', history.batchId + '.json'));
    // Completion removes the rollback journal. A crash before this point is
    // conservatively rolled back, while all committed ID reservations survive.
    await rm(stage, { recursive: true });
    timings.installMs = performance.now() - phase;
    return Object.fromEntries(Object.entries(timings).map(([key, value]) => [key, Number(value.toFixed(2))]));
  } catch (error) {
    try {
      if (!reserved) {
        // Incomplete pre-commit bytes may not be parseable (e.g. disk full).
        // No destination links have been created yet; discard only known regular
        // staging entries, never unknown files, links or caller-owned paths.
        const allowed = new Set(['journal.json', 'history.json', ...items.map(item => item.id + '.json')]);
        for (const name of await readdir(stage)) {
          const stat = await lstat(join(stage, name));
          if (!allowed.has(name) || !stat.isFile() || stat.isSymbolicLink()) rejectAuthor('AUTHOR_RECOVERY_REQUIRED', 'Unsafe staging requires inspection.');
        }
        await rm(stage, { recursive: true });
      } else await recoverAuthorStage(root);
    }
    catch (recovery) { recovery.reservedIds = reserved ? items.map(item => item.id) : []; throw recovery; }
    const failure = error instanceof AuthorError ? error : new AuthorError(error.code === 'EEXIST' ? 'AUTHOR_FILE_EXISTS' : 'AUTHOR_WRITE_FAILED', 'Draft batch was not installed; existing sources are preserved.');
    failure.reservedIds = reserved ? items.map(item => item.id) : [];
    throw failure;
  }
}
