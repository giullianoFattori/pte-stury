import { CONTENT_LIMITS } from '../../src/domain/content/validationPolicy.ts';
import { rejectAuthor } from './author-errors.mjs';
export const CSV_COLUMNS = Object.freeze(['id', 'taskType', 'difficulty', 'prompt', 'answer', 'transcript',
  'audioPath', 'audioSha256', 'audioDurationMs', 'audioMimeType', 'chunks', 'phraseGroups', 'stressWords',
  'revision', 'status', 'source', 'skills', 'tags', 'topic', 'estimatedSeconds']);
// Strict RFC4180-style state machine. Quoted line endings and whitespace are
// preserved, including CRLF; no delimiter guessing or implicit trimming.
export function parseCsv(text) {
  if (typeof text !== 'string' || text.length > CONTENT_LIMITS.jsonCodeUnits || text.startsWith('\ufeff')) rejectAuthor('IMPORT_INVALID_CSV', 'CSV must be bounded UTF-8 without a BOM.');
  const rows = []; let row = [], cell = '', state = 'start', ended = false;
  const field = () => { row.push(cell); cell = ''; state = 'start'; if (row.length > CSV_COLUMNS.length) rejectAuthor('IMPORT_INVALID_CSV', 'CSV column budget exceeded.'); };
  const record = () => { field(); rows.push(row); row = []; if (rows.length > CONTENT_LIMITS.batchItems + 1) rejectAuthor('IMPORT_INVALID_CSV', 'CSV row budget exceeded.'); };
  for (let index = 0; index < text.length; index++) {
    const char = text[index]; ended = false;
    if (state === 'quoted') {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') state = 'closed'; else cell += char;
    } else if (char === ',') field();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] !== '\n') rejectAuthor('IMPORT_INVALID_CSV', 'Unquoted CR must be followed by LF.');
      if (char === '\r') index++;
      record(); ended = true;
    } else if (char === '"' && state === 'start') state = 'quoted';
    else if (state === 'closed' || char === '"') rejectAuthor('IMPORT_INVALID_CSV', 'Malformed quoting or characters after a closing quote.');
    else { cell += char; state = 'plain'; }
  }
  if (state === 'quoted') rejectAuthor('IMPORT_INVALID_CSV', 'Unterminated quoted field.');
  if (!ended && text.length) record();
  const headers = rows.shift();
  if (!headers?.length || new Set(headers).size !== headers.length) rejectAuthor('IMPORT_INVALID_CSV', 'CSV requires unique column headers.');
  for (const header of headers) if (!CSV_COLUMNS.includes(header)) rejectAuthor('IMPORT_UNKNOWN_COLUMN', 'Unknown CSV column.', header.slice(0, 100));
  if (!rows.length) rejectAuthor('IMPORT_INVALID_CSV', 'CSV requires at least one content record.');
  return rows.map((values, index) => {
    if (values.length !== headers.length) rejectAuthor('IMPORT_INVALID_CSV', 'Row field count does not match headers.', `rows[${index}]`);
    return Object.fromEntries(headers.map((header, column) => [header, values[column]]));
  });
}
