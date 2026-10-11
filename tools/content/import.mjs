import { resolve, basename, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { readSource } from './read-source.mjs';
import { parseCsv } from './import-csv.mjs';
import { parseJsonImport, mapRecord, requireSource, validateImportRecords } from './import-map.mjs';
import { readRegistry, currentSources, checkSourceReservations, withRegistryLock, simulateIds, appendReservations, writeRegistry } from './ids.mjs';
import { recoverAuthorStage, installDraftBatch } from './author-install.mjs';
import { validateAudioAssets } from './audio-integrity.mjs';
import { AuthorError, rejectAuthor, authorFailure } from './author-errors.mjs';

export function parseInput(text, format) {
  if (format === 'csv') return parseCsv(text);
  if (format === 'json') return parseJsonImport(text);
  rejectAuthor('IMPORT_MAPPING_FAILED', 'Import supports only .csv and .json input.');
}
export async function previewImport(records, { root = resolve('content'), format = 'json', source, allocateIds = false, audioOptions, registry, sources } = {}) {
  requireSource(source);
  const mapped = records.map(record => mapRecord(record, { format, source, allocateIds }));
  registry ??= await readRegistry(root); sources ??= await currentSources(root); checkSourceReservations(registry, sources);
  const candidates = allocateIds ? simulateIds(registry, mapped.map(item => item.taskType)) : mapped.map(item => item.id);
  const batch = validateImportRecords(mapped.map((item, index) => ({ ...item, ...(allocateIds ? { id: candidates[index] } : {}) })));
  const existing = new Set([...registry.entries.map(entry => entry.id), ...sources.map(item => item.id)]);
  for (const item of batch.items) if (existing.has(item.id)) rejectAuthor('IMPORT_EXISTING_ID', 'Import is not an update mechanism; ID is already allocated.', item.id);
  const updated = appendReservations(registry, batch.items);
  const audio = await validateAudioAssets(batch.items, { reportOrphans: false, ...audioOptions });
  if (audio.errors.length) { const error = new AuthorError('IMPORT_MAPPING_FAILED', 'Referenced audio failed integrity validation.'); error.issues = audio.errors; throw error; }
  return { items: batch.items, registry: updated, warnings: [...batch.warnings, ...audio.warnings], audio: audio.stats };
}
export async function importRecords(records, options = {}) {
  if (!Array.isArray(records) || !records.length || records.length > 10000) rejectAuthor('IMPORT_MAPPING_FAILED', 'Import requires 1–10000 records.');
  if (options.note !== undefined && (typeof options.note !== 'string' || !/\S/u.test(options.note) || options.note.length > 1000 || [...options.note].some(char => char.charCodeAt(0) < 32)))
    rejectAuthor('IMPORT_MAPPING_FAILED', 'Provenance note must be bounded nonempty single-line text without control characters.');
  const root = options.root ?? resolve('content');
  const finish = async () => {
    if (!options.dryRun) await recoverAuthorStage(root);
    const preview = await previewImport(records, options);
    const ids = preview.items.map(item => item.id);
    if (options.dryRun) return { success: true, dryRun: true, inputRecords: records.length, createdDrafts: 0, reservedIds: 0,
      simulatedIds: ids, warnings: preview.warnings, audio: preview.audio, note: 'Simulated IDs are advisory until locked reservation.' };
    const safeName = basename(options.inputName ?? 'author-input.json');
    const history = { batchId: randomUUID(), source: options.source,
      inputFilename: /^[A-Za-z0-9_.-]{1,128}$/.test(safeName) ? safeName : 'author-input' + (options.format === 'csv' ? '.csv' : '.json'),
      importedAt: new Date().toISOString(), itemIds: ids,
      ...(options.note !== undefined ? { note: options.note } : {}) };
    const timings = await installDraftBatch(root, preview.items, history, () => writeRegistry(root, preview.registry, options.registryOptions), options.installOptions);
    return { success: true, dryRun: false, inputRecords: records.length, createdDrafts: ids.length, reservedIds: ids.length,
      itemIds: ids, batchId: history.batchId, warnings: preview.warnings, audio: preview.audio, timings };
  };
  // Dry-run does not acquire/create a lock or recover/write pending state.
  return options.dryRun ? finish() : withRegistryLock(root, finish);
}
export async function importFile(file, options) {
  const format = extname(file).slice(1);
  if (!['csv', 'json'].includes(format)) rejectAuthor('IMPORT_MAPPING_FAILED', 'Import supports only .csv and .json input.');
  let text;
  try { text = await readSource(file); }
  catch { rejectAuthor(format === 'csv' ? 'IMPORT_INVALID_CSV' : 'INVALID_JSON', 'Import input must be an existing regular, bounded UTF-8 file without symlinks.'); }
  const started = performance.now(), rows = parseInput(text, format);
  const parseMs = Number((performance.now() - started).toFixed(2));
  const result = await importRecords(rows, { ...options, format, inputName: basename(file) });
  return { ...result, timings: { parseMs, ...result.timings } };
}
export function importArguments(args) {
  const file = args.shift(); if (!file || file.startsWith('--')) rejectAuthor('INVALID_ARGUMENTS', 'Provide an input CSV or JSON file.');
  const options = {}, seen = new Set();
  while (args.length) {
    const flag = args.shift(); if (seen.has(flag)) rejectAuthor('INVALID_ARGUMENTS', 'Repeated import option.'); seen.add(flag);
    if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--allocate-ids') options.allocateIds = true;
    else if (flag === '--source' || flag === '--note') {
      const value = args.shift(); if (!value || value.startsWith('--')) rejectAuthor('INVALID_ARGUMENTS', 'Option requires a value.');
      options[flag === '--source' ? 'source' : 'note'] = value;
    } else rejectAuthor('INVALID_ARGUMENTS', 'Unknown import option.');
  }
  requireSource(options.source);
  return { file, options };
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  try { const { file, options } = importArguments(process.argv.slice(2)); console.log(JSON.stringify(await importFile(file, options), null, 2)); }
  catch (error) { authorFailure(error); }
}
