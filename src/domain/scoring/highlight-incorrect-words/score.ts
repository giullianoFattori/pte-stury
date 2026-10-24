import type { HighlightWordToken } from '../../pte/taskData.ts';
import type { HiwScore } from './types.ts';

/** Pearson-style deterministic selection arithmetic; no language model or approximation. */
export function scoreHighlightIncorrectWords(tokens: readonly HighlightWordToken[], selectedTokenIds: readonly string[]): HiwScore {
  if (!Array.isArray(tokens) || tokens.length === 0 || !Array.isArray(selectedTokenIds)) throw new TypeError('A non-empty token set and selected token IDs are required.');
  const byId = new Map<string, HighlightWordToken>();
  for (const token of tokens) {
    if (!token || typeof token.id !== 'string' || !token.id || byId.has(token.id) || typeof token.text !== 'string' || !token.text.trim() || typeof token.incorrect !== 'boolean')
      throw new TypeError('HIW tokens must have unique stable IDs, text and authored truth.');
    byId.set(token.id, token);
  }
  const selected = new Set<string>();
  for (const id of selectedTokenIds) {
    if (typeof id !== 'string' || !byId.has(id) || selected.has(id)) throw new TypeError('Selected HIW token IDs must be unique and belong to the current item.');
    selected.add(id);
  }
  const actualIncorrect = tokens.filter(token => token.incorrect).map(token => token.id);
  if (!actualIncorrect.length) throw new TypeError('At least one authored incorrect token is required.');
  const correctTokenIds = actualIncorrect.filter(id => selected.has(id));
  const falsePositiveTokenIds = tokens.filter(token => selected.has(token.id) && !token.incorrect).map(token => token.id);
  const missedTokenIds = actualIncorrect.filter(id => !selected.has(id));
  const correctSelections = correctTokenIds.length, incorrectSelections = falsePositiveTokenIds.length, missedIncorrectWords = missedTokenIds.length;
  const rawScore = correctSelections - incorrectSelections, clampedScore = Math.max(0, rawScore), maxScore = actualIncorrect.length;
  return Object.freeze({ rawScore, score: clampedScore / maxScore, maxScore, correctSelections, incorrectSelections, missedIncorrectWords,
    precision: selected.size ? correctSelections / selected.size : 0, recall: correctSelections / maxScore,
    selectedTokenIds: Object.freeze([...selected]), correctTokenIds: Object.freeze(correctTokenIds), falsePositiveTokenIds: Object.freeze(falsePositiveTokenIds), missedTokenIds: Object.freeze(missedTokenIds) });
}
