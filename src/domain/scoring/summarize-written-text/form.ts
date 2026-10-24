import { countWords } from '../shared/writing/wordCount.ts';
import { countDetectedSentences, endsWithTerminalPunctuation, hasDuplicatePunctuation, isAllCaps, startsWithCapital } from '../shared/writing/sentenceBoundaries.ts';
import type { SwtFormResult } from './types.ts';
export const SWT_FORM_CONFIG = Object.freeze({ minimumWords: 5, maximumWords: 75 });

/** A local estimate of Form. It does not judge whether a sentence is linguistically complete. */
export function validateSwtForm(response: string): SwtFormResult {
  const wordCount = countWords(response), sentenceCount = countDetectedSentences(response), withinWordLimit = wordCount >= SWT_FORM_CONFIG.minimumWords && wordCount <= SWT_FORM_CONFIG.maximumWords;
  const singleSentence = sentenceCount === 1, allCaps = isAllCaps(response);
  return Object.freeze({ wordCount, withinWordLimit, sentenceCount, singleSentence, startsWithCapital: startsWithCapital(response),
    endsWithTerminalPunctuation: endsWithTerminalPunctuation(response), allCaps, duplicatePunctuation: hasDuplicatePunctuation(response),
    formValid: withinWordLimit && singleSentence && !allCaps });
}
