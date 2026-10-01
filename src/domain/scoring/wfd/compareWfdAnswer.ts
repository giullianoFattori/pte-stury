import { compareTokens } from './compareTokens.ts';
import { normalizeText } from './normalizeText.ts';
import { tokenizeText } from './tokenizeText.ts';
import type { WfdComparisonResult } from './types';

export function compareWfdAnswer(expectedRaw: string, actualRaw: string): WfdComparisonResult {
  const expectedNormalized = normalizeText(expectedRaw);
  const actualNormalized = normalizeText(actualRaw);
  const expectedTokens = tokenizeText(expectedRaw);
  const actualTokens = tokenizeText(actualRaw);
  const tokens = compareTokens(expectedTokens, actualTokens);

  return {
    expectedRaw,
    actualRaw,
    expectedNormalized,
    actualNormalized,
    expectedTokens,
    actualTokens,
    tokens,
    correctCount: tokens.filter((token) => token.status === 'correct').length,
    missingCount: tokens.filter((token) => token.status === 'missing').length,
    extraCount: tokens.filter((token) => token.status === 'extra').length,
    substitutionCount: tokens.filter((token) => token.status === 'substitution').length,
    expectedWordCount: expectedTokens.length,
    actualWordCount: actualTokens.length,
  };
}
