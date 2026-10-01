import { tokenizeText } from '../../../domain/scoring/wfd/tokenizeText.ts';

export function createWfdClozePrompt(expectedSentence: string, expectedIndex: number): string {
  const tokens = tokenizeText(expectedSentence);
  if (!Number.isInteger(expectedIndex) || expectedIndex < 0 || expectedIndex >= tokens.length) {
    return expectedSentence;
  }

  return tokens.map((token, index) => index === expectedIndex ? '___' : token).join(' ');
}
