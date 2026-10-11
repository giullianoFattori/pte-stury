import { mkdir, writeFile, rm, rename, open, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseContentJson, parseQuestionBankItemJson } from '../../src/domain/content/validation.ts';
import { LEGACY_QUESTION_IDS, newQuestionIdPattern } from '../../src/domain/content/validationPolicy.ts';
import { QUESTION_ID_PREFIXES } from '../../src/domain/content/types.ts';
import { discover, assertDirectory } from './discover.mjs';
import { readSource } from './read-source.mjs';
import { AuthorError, rejectAuthor, authorFailure } from './author-errors.mjs';
import { recoverAuthorStage } from './author-install.mjs';
export const TECHNICAL_RANGE = Object.freeze([900000, 999999]);
export const REGISTRY_LIMIT = 16 * 1024 * 1024;
export function initialRegistry() {
  return { version: 1, technicalRange: [...TECHNICAL_RANGE], entries: Object.entries(LEGACY_QUESTION_IDS).flatMap(([taskType, ids]) =>
    [...ids.map(id => ({ id, taskType, kind: 'legacy' })), { id: QUESTION_ID_PREFIXES[taskType] + '-900001', taskType, kind: 'technical' }]) };
}
export function validateRegistry(value) {
  const invalid = () => rejectAuthor('ID_REGISTRY_INVALID', 'Registry must retain unique permanent identities, baseline reservations and the fixed technical range.');
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'entries,technicalRange,version'
    || value.version !== 1 || JSON.stringify(value.technicalRange) !== JSON.stringify(TECHNICAL_RANGE) || !Array.isArray(value.entries) || value.entries.length > 100000) invalid();
  const ids = new Set();
  for (const entry of value.entries) {
    if (!entry || typeof entry !== 'object' || Object.keys(entry).sort().join(',') !== 'id,kind,taskType'
      || !Object.hasOwn(QUESTION_ID_PREFIXES, entry.taskType) || typeof entry.id !== 'string'
      || !['legacy', 'technical', 'reserved', 'retired', 'abandoned'].includes(entry.kind) || ids.has(entry.id)) invalid();
    const legacy = LEGACY_QUESTION_IDS[entry.taskType].includes(entry.id);
    if (!legacy && !new RegExp(newQuestionIdPattern(entry.taskType)).test(entry.id)) invalid();
    const technical = !legacy && Number(entry.id.slice(-6)) >= TECHNICAL_RANGE[0];
    if (legacy && !['legacy', 'retired', 'abandoned'].includes(entry.kind) || technical && entry.kind !== 'technical' || !legacy && !technical && !['reserved', 'retired', 'abandoned'].includes(entry.kind)) invalid();
    ids.add(entry.id);
  }
  for (const required of initialRegistry().entries) if (!value.entries.some(entry => entry.id === required.id && (required.kind === 'legacy' || entry.kind === required.kind))) invalid();
  return value;
}
export async function readRegistry(root = resolve('content')) {
  try {
    await assertDirectory(root);
    return validateRegistry(parseContentJson(await readSource(join(root, 'id-registry.json'), REGISTRY_LIMIT), REGISTRY_LIMIT));
  } catch (error) { if (error instanceof AuthorError) throw error; rejectAuthor('ID_REGISTRY_INVALID', 'Registry could not be read and validated safely.'); }
}
export function simulateIds(registry, tasks, { maximum = TECHNICAL_RANGE[0] - 1 } = {}) {
  validateRegistry(registry);
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum >= TECHNICAL_RANGE[0]) rejectAuthor('ID_REGISTRY_INVALID', 'Invalid normal allocation bound.');
  const used = new Set(registry.entries.map(entry => entry.id)), cursor = new Map();
  return tasks.map(task => {
    if (!Object.hasOwn(QUESTION_ID_PREFIXES, task)) rejectAuthor('INVALID_TASK_TYPE', 'Only implemented task types can receive IDs.');
    let number = cursor.get(task) ?? 1, id;
    do { id = QUESTION_ID_PREFIXES[task] + '-' + String(number).padStart(6, '0'); if (!used.has(id)) break; number++; } while (number <= maximum);
    if (number > maximum) rejectAuthor('ID_SPACE_EXHAUSTED', 'Normal six-digit ID space is exhausted.');
    used.add(id); cursor.set(task, number + 1); return id;
  });
}
export async function currentSources(root) {
  const sources = [];
  for (const file of await discover(root)) {
    const item = parseQuestionBankItemJson(await readSource(file.path));
    if (file.task !== item.taskType || file.path.split(/[\\/]/).at(-1) !== item.id + '.json')
      rejectAuthor('AUTHOR_FILENAME_MISMATCH', 'Production files must use their authoritative ID as filename in the matching task directory.');
    sources.push(item);
  }
  const seen = new Set();
  for (const item of sources) { if (seen.has(item.id)) rejectAuthor('IMPORT_DUPLICATE_ID', 'Current source contains duplicate identities.'); seen.add(item.id); }
  return sources;
}
export function checkSourceReservations(registry, sources) {
  const ids = new Set(registry.entries.map(entry => entry.id));
  if (sources.some(item => !ids.has(item.id))) rejectAuthor('ID_REGISTRY_INVALID', 'Every current source identity must be permanently registered.');
}
export async function withRegistryLock(root, operation) {
  await assertDirectory(root);
  const lock = join(root, '.author-lock');
  try { await mkdir(lock, { mode: 0o700 }); }
  catch { rejectAuthor('ID_REGISTRY_LOCKED', 'Authoring registry is locked; inspect a stale owner before explicit recovery.'); }
  try {
    await writeFile(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, instance: randomUUID() }), { flag: 'wx', mode: 0o600 });
    return await operation();
  } finally { await rm(lock, { recursive: true }); }
}
export async function writeRegistry(root, registry, { replace = rename } = {}) {
  validateRegistry(registry);
  const previous = await readRegistry(root), incoming = new Map(registry.entries.map(entry => [entry.id, entry]));
  if (previous.entries.some(entry => incoming.get(entry.id)?.taskType !== entry.taskType))
    rejectAuthor('ID_REGISTRY_INVALID', 'Registry replacement must preserve every previously allocated identity and task.');
  const next = join(root, '.id-registry.next');
  try {
    // Known stale replacement may be discarded: old registry is authoritative
    // until rename, and no source installation happens before that commit.
    try { validateRegistry(parseContentJson(await readSource(next, REGISTRY_LIMIT), REGISTRY_LIMIT)); await rm(next); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const file = await open(next, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(registry, null, 2) + '\n'); await file.sync(); }
    finally { await file.close(); }
    await replace(next, join(root, 'id-registry.json'));
  } finally {
    await discardRegistryNext(next);
  }
}
async function discardRegistryNext(next) {
  try { const stat = await lstat(next); if (!stat.isFile() || stat.isSymbolicLink()) rejectAuthor('ID_REGISTRY_INVALID', 'Unsafe registry staging file.'); await rm(next); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
export function appendReservations(registry, rows) {
  const existing = new Set(registry.entries.map(entry => entry.id));
  for (const row of rows) {
    if (existing.has(row.id)) rejectAuthor('ID_ALREADY_ALLOCATED', 'ID is permanently allocated.');
    if (!new RegExp(newQuestionIdPattern(row.taskType)).test(row.id) || Number(row.id.slice(-6)) >= TECHNICAL_RANGE[0])
      rejectAuthor('ID_TECHNICAL_RANGE', 'Generic authoring requires a normal six-digit identity outside the technical range.');
    existing.add(row.id);
  }
  return validateRegistry({ ...registry, entries: [...registry.entries, ...rows.map(({ id, taskType }) => ({ id, taskType, kind: 'reserved' }))] });
}
export async function reserveId(taskType, { root = resolve('content'), registryOptions } = {}) {
  return withRegistryLock(root, async () => {
    await recoverAuthorStage(root);
    const registry = await readRegistry(root), sources = await currentSources(root); checkSourceReservations(registry, sources);
    const [id] = simulateIds(registry, [taskType]);
    await writeRegistry(root, appendReservations(registry, [{ id, taskType }]), registryOptions);
    return { success: true, taskType, id };
  });
}
export async function auditIds(root = resolve('content')) {
  const registry = await readRegistry(root), sources = await currentSources(root); checkSourceReservations(registry, sources);
  const present = new Set(sources.map(item => item.id));
  return { success: true, allocatedByTask: Object.fromEntries(Object.keys(QUESTION_ID_PREFIXES).map(task => [task, registry.entries.filter(e => e.taskType === task).length])),
    nextNormalIds: Object.fromEntries(Object.keys(QUESTION_ID_PREFIXES).map(task => { try { return [task, simulateIds(registry, [task])[0]]; } catch (error) { if (error.issues?.[0].code === 'ID_SPACE_EXHAUSTED') return [task, null]; throw error; } })),
    technicalRange: TECHNICAL_RANGE, technicalReservations: registry.entries.filter(e => e.kind === 'technical').map(e => e.id),
    reservedWithoutSource: registry.entries.filter(e => !present.has(e.id)).map(e => e.id), currentSourceIds: [...present].sort() };
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 1 || args[0] !== '--recover-stage')) rejectAuthor('INVALID_ARGUMENTS', 'ID audit accepts only optional --recover-stage.');
    if (args.length) await withRegistryLock(resolve('content'), () => recoverAuthorStage(resolve('content')));
    console.log(JSON.stringify(await auditIds(), null, 2));
  }
  catch (error) { authorFailure(error); }
}
