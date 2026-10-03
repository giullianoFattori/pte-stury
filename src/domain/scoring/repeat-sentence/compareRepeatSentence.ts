import { compareTokens } from '../shared/compareTokens.ts';
import { normalizeText } from '../shared/normalizeText.ts';
import { tokenizeText } from '../shared/tokenizeText.ts';
import type { RepeatSentenceComparisonResult } from './types';

export function compareRepeatSentence(expectedRaw: string, actualRaw: string): RepeatSentenceComparisonResult {
  const expectedTokens = tokenizeText(expectedRaw);
  const actualTokens = tokenizeText(actualRaw);
  const tokens = compareTokens(expectedTokens, actualTokens);
  return {
    expectedRaw, actualRaw,
    expectedNormalized: normalizeText(expectedRaw),
    actualNormalized: normalizeText(actualRaw),
    expectedTokens, actualTokens, tokens,
    correctCount: tokens.filter((token) => token.status === 'correct').length,
    missingCount: tokens.filter((token) => token.status === 'missing').length,
    extraCount: tokens.filter((token) => token.status === 'extra').length,
    substitutionCount: tokens.filter((token) => token.status === 'substitution').length,
    expectedWordCount: expectedTokens.length,
    actualWordCount: actualTokens.length,
  };
}
