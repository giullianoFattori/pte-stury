import { parseContentJson, validateQuestionBankItems } from '../../src/domain/content/validation.ts';
import { CONTENT_FIELDS, CONTENT_LIMITS } from '../../src/domain/content/validationPolicy.ts';
import { CONTENT_SOURCES } from '../../src/domain/content/types.ts';
import { CSV_COLUMNS } from './import-csv.mjs';
import { AuthorError, rejectAuthor } from './author-errors.mjs';
export function parseJsonImport(text) {
  const value = parseContentJson(text);
  const rows = Array.isArray(value) ? value : [value];
  if (!rows.length || rows.length > CONTENT_LIMITS.batchItems) rejectAuthor('IMPORT_MAPPING_FAILED', 'Import must contain 1–10000 records.');
  return rows;
}
export function requireSource(source) {
  if (!CONTENT_SOURCES.includes(source)) rejectAuthor('IMPORT_SOURCE_REQUIRED', 'An explicit internal/licensed/generated/imported source is required.');
}
export function mapRecord(record, { format, source, allocateIds }) {
  requireSource(source);
  if (!record || typeof record !== 'object' || Array.isArray(record) || Object.getPrototypeOf(record) !== Object.prototype) rejectAuthor('IMPORT_MAPPING_FAILED', 'Each import record must be a JSON object.');
  const allowed = format === 'csv' ? CSV_COLUMNS : CONTENT_FIELDS;
  for (const key of Object.keys(record)) if (!allowed.includes(key)) rejectAuthor('IMPORT_UNKNOWN_COLUMN', 'Unknown import field.', key.slice(0, 100));
  const output = {};
  for (const [key, value] of Object.entries(record)) {
    if (format === 'csv' && value === '') continue; // documented absent optional cell
    if (format === 'csv' && ['difficulty', 'revision', 'estimatedSeconds', 'audioDurationMs'].includes(key)) {
      if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) rejectAuthor('IMPORT_MAPPING_FAILED', 'Numeric CSV cells require explicit unsigned decimal notation.', key);
      output[key] = Number(value);
    } else if (format === 'csv' && ['tags', 'skills', 'chunks', 'phraseGroups', 'stressWords'].includes(key)) {
      try { const values = parseContentJson(value); if (!Array.isArray(values)) throw new Error(); output[key] = values; }
      catch { rejectAuthor('IMPORT_INVALID_ARRAY_CELL', 'Array cells must contain JSON arrays.', key); }
    } else if (format === 'csv' && key === 'taskData') {
      try { const data = parseContentJson(value); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(); output[key] = data; }
      catch { rejectAuthor('IMPORT_MAPPING_FAILED', 'taskData cells must contain a JSON object.', key); }
    } else output[key] = value;
  }
  if (format === 'csv') {
    if (['audioSha256', 'audioDurationMs', 'audioMimeType'].some(key => Object.hasOwn(output, key)) && !Object.hasOwn(output, 'audioPath'))
      rejectAuthor('IMPORT_MAPPING_FAILED', 'Audio metadata requires audioPath.', 'audioPath');
    if (Object.hasOwn(output, 'audioPath')) {
      output.audio = { path: output.audioPath };
      for (const [from, to] of [['audioSha256', 'sha256'], ['audioDurationMs', 'durationMs'], ['audioMimeType', 'mimeType']]) if (Object.hasOwn(output, from)) output.audio[to] = output[from];
    }
    for (const key of ['audioPath', 'audioSha256', 'audioDurationMs', 'audioMimeType']) delete output[key];
  }
  if (Object.hasOwn(output, 'status') && output.status !== 'draft') rejectAuthor('IMPORT_PUBLISHED_FORBIDDEN', 'Generic imports accept draft status only.', 'status');
  if (Object.hasOwn(output, 'source') && output.source !== source) rejectAuthor('IMPORT_MAPPING_FAILED', 'Record source must agree with the explicit batch source.', 'source');
  if (allocateIds && Object.hasOwn(output, 'id')) rejectAuthor('IMPORT_MAPPING_FAILED', 'Allocate mode requires records without IDs.', 'id');
  if (!Object.hasOwn(output, 'status')) output.status = 'draft';
  if (!Object.hasOwn(output, 'source')) output.source = source;
  if (!Object.hasOwn(output, 'revision')) output.revision = 1;
  return output;
}
export function validateImportRecords(records) {
  const batch = validateQuestionBankItems(records);
  if (!batch.success) { const error = new AuthorError('IMPORT_MAPPING_FAILED', 'Canonical draft validation failed.'); error.issues = batch.errors.map(issue => ({ ...issue, code: issue.code === 'DUPLICATE_ID' ? 'IMPORT_DUPLICATE_ID' : issue.code })); error.warnings = batch.warnings; throw error; }
  return batch;
}
