import type { StudyItem } from '../pte/types';

/** Partial Fisher–Yates; caller supplies RNG and candidate ordering. */
export function sampleStudyItems(items: readonly StudyItem[], count: number, rng: () => number): StudyItem[] {
  if (!Number.isSafeInteger(count) || count < 0 || count > items.length) throw new RangeError('Sample count must be a nonnegative safe integer within candidate count.');
  if (typeof rng !== 'function') throw new TypeError('Sampling requires an injected RNG.');
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('Sampling candidates must have unique identities.');
  const pool = [...items];
  for (let i = 0; i < count; i++) {
    const random = rng();
    if (!Number.isFinite(random) || random < 0 || random >= 1) throw new RangeError('RNG must return finite values in [0, 1).');
    const other = i + Math.floor(random * (pool.length - i));
    [pool[i], pool[other]] = [pool[other], pool[i]];
  }
  return pool.slice(0, count);
}
