import { countWords } from '../shared/writing/wordCount.ts';
import { isAllCaps, splitDetectedSentences } from '../shared/writing/sentenceBoundaries.ts';
import type { EssayFormResult } from './types.ts';

export const ESSAY_FORM_CONFIG = Object.freeze({ fullMinimum: 200, fullMaximum: 300, partialMinimum: 120, partialMaximum: 380, veryShortSentenceMaximumWords: 5, veryShortSentenceMinimumCount: 4 });
const BULLET_LINE = /^\s*(?:[-*•]|\d+[.)])\s+\S/u;

/** Local approximation of essay Form bands. Structural zero rules override word-count bands. */
export function validateEssayForm(response: string): EssayFormResult {
  const wordCount = countWords(response), targetRange = wordCount >= 200 && wordCount <= 300;
  const partialRange = (wordCount >= 120 && wordCount < 200) || (wordCount > 300 && wordCount <= 380);
  const zeroRange = wordCount < 120 || wordCount > 380;
  const allCaps = isAllCaps(response), hasPunctuation = /[.!?,;:]/u.test(response);
  const lines = response.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
  const bulletLike = lines.length > 0 && lines.every(line => BULLET_LINE.test(line));
  const sentences = splitDetectedSentences(response);
  const veryShortSentencePattern = sentences.length >= ESSAY_FORM_CONFIG.veryShortSentenceMinimumCount
    && sentences.every(sentence => countWords(sentence) <= ESSAY_FORM_CONFIG.veryShortSentenceMaximumWords);
  const structuralReason = allCaps ? 'all-caps' : bulletLike ? 'bullet-like' : !hasPunctuation ? 'no-punctuation' : veryShortSentencePattern ? 'very-short-sentences' : undefined;
  const zeroFormReason = structuralReason ?? (zeroRange ? wordCount < ESSAY_FORM_CONFIG.partialMinimum ? 'too-short' : 'too-long' : undefined);
  const formPoints: 0 | 1 | 2 = zeroFormReason ? 0 : targetRange ? 2 : partialRange ? 1 : 0;
  return Object.freeze({ wordCount, formPoints, formCredit: (formPoints / 2) as 0 | 0.5 | 1, targetRange, partialRange, zeroRange, allCaps, hasPunctuation, bulletLike, veryShortSentencePattern, ...(zeroFormReason ? { zeroFormReason } : {}) });
}

export function essaySentenceCount(response: string): number { return splitDetectedSentences(response).length; }
