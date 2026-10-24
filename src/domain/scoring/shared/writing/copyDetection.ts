import { writingTokens } from './wordCount.ts';

export const COPY_DETECTION_CONFIG = Object.freeze({ minimumCopiedRunWords: 4 });
export type CopyDetection = Readonly<{ sourceCopyRatio: number; sourceCopyPercent: number; longestCopiedRunWords: number }>;

/** Finds contiguous copied runs; short, common academic word overlap is ignored. */
export function detectSourceCopy(response: string, passage: string): CopyDetection {
  const responseWords = writingTokens(response), sourceWords = writingTokens(passage), copied = new Set<number>();
  let longestCopiedRunWords = 0;
  for (let i = 0; i < responseWords.length; i++) {
    for (let j = 0; j < sourceWords.length; j++) {
      let length = 0;
      while (responseWords[i + length] !== undefined && responseWords[i + length] === sourceWords[j + length]) length++;
      if (length >= COPY_DETECTION_CONFIG.minimumCopiedRunWords) {
        longestCopiedRunWords = Math.max(longestCopiedRunWords, length);
        for (let k = i; k < i + length; k++) copied.add(k);
      }
    }
  }
  const sourceCopyRatio = responseWords.length ? copied.size / responseWords.length : 0;
  return Object.freeze({ sourceCopyRatio, sourceCopyPercent: sourceCopyRatio * 100, longestCopiedRunWords });
}
