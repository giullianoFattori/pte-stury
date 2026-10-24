/** Counts whitespace-delimited lexical words; internal hyphens/apostrophes stay part of a word. */
export function countWords(value: string): number {
  return value.trim().split(/\s+/u).filter(part => /[\p{L}\p{N}]/u.test(part)).length;
}

/** Unicode lexical tokens for diagnostics whose identity must agree with authored coverage. */
export function writingTokens(value: string): readonly string[] {
  return Object.freeze(value.normalize('NFKC').toLocaleLowerCase('en').match(/[\p{L}\p{N}]+(?:['’\-‐‑][\p{L}\p{N}]+)*/gu) ?? []);
}
