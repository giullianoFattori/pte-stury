import { QUESTION_BANK_SCHEMA_VERSION } from '../../src/domain/content/types.ts';
import { CONTENT_FIELDS } from '../../src/domain/content/validationPolicy.ts';

export const TASK_ORDER = Object.freeze(['write-from-dictation', 'repeat-sentence', 'read-aloud']);
export const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export const jsonBytes = value => JSON.stringify(value, null, 2) + '\n';
export function canonicalBundle(items) {
  const ordered = [...items].sort((a, b) => TASK_ORDER.indexOf(a.taskType) - TASK_ORDER.indexOf(b.taskType) || compare(a.id, b.id));
  return { schemaVersion: QUESTION_BANK_SCHEMA_VERSION, items: ordered.map(item => {
    const result = {};
    for (const field of CONTENT_FIELDS) {
      if (!Object.hasOwn(item, field)) continue;
      if (field === 'audio') {
        result.audio = {};
        for (const key of ['path', 'sha256', 'durationMs', 'mimeType']) {
          if (Object.hasOwn(item.audio, key)) result.audio[key] = item.audio[key];
        }
      } else if (field === 'tags' || field === 'skills') result[field] = [...item[field]].sort(compare);
      else result[field] = Array.isArray(item[field]) ? [...item[field]] : item[field];
    }
    return result;
  }) };
}
