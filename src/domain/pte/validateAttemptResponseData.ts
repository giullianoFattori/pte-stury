import type { Attempt, AttemptResponseData } from './types.ts';
const LEGACY_HIW_KEYS = ['selectedTokenIds','correctTokenIds','falsePositiveTokenIds','missedTokenIds'] as const;
const MAX_IDS = 2000;
function plain(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function ids(value: unknown, max = MAX_IDS): value is readonly string[] { return Array.isArray(value) && value.length <= max && value.every(id => typeof id === 'string' && id.length > 0 && id.length <= 64) && new Set(value).size === value.length; }
function answers(value: unknown): value is Record<string, string> { return plain(value) && Object.keys(value).length <= MAX_IDS && Object.entries(value).every(([id, answer]) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id) && typeof answer === 'string' && answer.length <= 1000); }
const RESPONSE_TASKS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'token-selection': ['highlight-incorrect-words'],
  'single-choice': ['reading-multiple-choice-single','listening-multiple-choice-single','highlight-correct-summary','select-missing-word'],
  'multiple-choice': ['reading-multiple-choice-multiple','listening-multiple-choice-multiple'],
  'blank-text': ['listening-fill-blanks-type-in'],
  'blank-choice': ['reading-fill-blanks-dropdown','reading-fill-blanks-drag-drop'],
  'ordered-blocks': ['reorder-paragraph'],
});
function validateLegacyHiw(value: unknown): void {
  if (!plain(value) || Object.keys(value).some(key => !LEGACY_HIW_KEYS.includes(key as typeof LEGACY_HIW_KEYS[number]))) throw new TypeError('Legacy HIW response data must be a plain recognized object.');
  const data = value as Record<typeof LEGACY_HIW_KEYS[number], unknown>;
  if (!LEGACY_HIW_KEYS.every(key => Object.hasOwn(data,key) && ids(data[key]))) throw new TypeError('HIW response token IDs must be present, unique and bounded.');
  const selected = new Set(data.selectedTokenIds as string[]), correct = new Set(data.correctTokenIds as string[]), falsePositive = new Set(data.falsePositiveTokenIds as string[]), missed = new Set(data.missedTokenIds as string[]);
  if ([...correct].some(id => !selected.has(id)) || [...falsePositive].some(id => !selected.has(id) || correct.has(id)) || selected.size !== correct.size + falsePositive.size || [...missed].some(id => selected.has(id))) throw new TypeError('HIW selected, correct, false-positive and missed token sets are inconsistent.');
}
/** Validates additive typed response payloads and the pre-union HIW shape still in persisted history. */
export function validateAttemptResponseData(attempt: Attempt): void {
  const value = attempt.responseData;
  if (value === undefined) return;
  if (!plain(value)) throw new TypeError('Attempt response data must be a plain object.');
  if (!Object.hasOwn(value, 'kind')) {
    if (attempt.taskType !== 'highlight-incorrect-words') throw new TypeError('Legacy structured response data is only valid for Highlight Incorrect Words.');
    validateLegacyHiw(value); return;
  }
  if (typeof value.kind !== 'string' || !RESPONSE_TASKS[value.kind]?.includes(attempt.taskType)) throw new TypeError('Response kind is not valid for this task.');
  const data = value as AttemptResponseData & Record<string, unknown>;
  switch (data.kind) {
    case 'token-selection':
      if (Object.keys(data).some(k => !['kind','selectedTokenIds'].includes(k)) || !ids(data.selectedTokenIds)) throw new TypeError('Invalid token selection response.'); break;
    case 'single-choice':
      if (Object.keys(data).some(k => !['kind','selectedOptionId'].includes(k)) || (data.selectedOptionId !== undefined && (typeof data.selectedOptionId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(data.selectedOptionId)))) throw new TypeError('Invalid single-choice response.'); break;
    case 'multiple-choice':
      if (Object.keys(data).some(k => !['kind','selectedOptionIds'].includes(k)) || !ids(data.selectedOptionIds)) throw new TypeError('Invalid multiple-choice response.'); break;
    case 'blank-text':
    case 'blank-choice':
      if (Object.keys(data).some(k => !['kind','answers'].includes(k)) || !answers(data.answers)) throw new TypeError('Invalid blank response.'); break;
    case 'ordered-blocks':
      if (Object.keys(data).some(k => !['kind','blockIds'].includes(k)) || !ids(data.blockIds, 200)) throw new TypeError('Invalid ordered-block response.'); break;
    default: throw new TypeError('Unknown response data kind.');
  }
}
