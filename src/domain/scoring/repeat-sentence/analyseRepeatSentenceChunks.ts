import { tokenizeText } from '../shared/tokenizeText.ts';
import type { RepeatSentenceComparisonResult, RsChunkAnalysis } from './types';

export class RsChunkMetadataError extends Error {
  constructor() {
    super('Chunk feedback is unavailable because the question chunks do not match the expected sentence.');
    this.name = 'RsChunkMetadataError';
  }
}

export function analyseRepeatSentenceChunks(
  comparison: RepeatSentenceComparisonResult,
  chunkTexts: readonly string[],
): RsChunkAnalysis {
  const tokenizedChunks = chunkTexts.map(tokenizeText);
  const combined = tokenizedChunks.flat();
  if (!chunkTexts.length || tokenizedChunks.some((tokens) => !tokens.length)
    || combined.length !== comparison.expectedTokens.length
    || combined.some((token, index) => token !== comparison.expectedTokens[index])) {
    throw new RsChunkMetadataError();
  }
  const correctPositions = new Set(comparison.tokens
    .filter((token) => token.status === 'correct')
    .map((token) => token.expectedIndex));
  let start = 0;
  const chunks = chunkTexts.map((text, index) => {
    const expectedWords = tokenizedChunks[index].length;
    let correctWords = 0;
    for (let offset = 0; offset < expectedWords; offset += 1) {
      if (correctPositions.has(start + offset)) correctWords += 1;
    }
    start += expectedWords;
    const recall = correctWords / expectedWords;
    return { index, text, expectedWords, correctWords, recall,
      recallPercent: Number((recall * 100).toFixed(2)), retained: correctWords === expectedWords };
  });
  const retainedChunks = chunks.filter((chunk) => chunk.retained).length;
  const chunkRetention = retainedChunks / chunks.length;
  return { chunks, retainedChunks, totalChunks: chunks.length, chunkRetention,
    chunkRetentionPercent: Number((chunkRetention * 100).toFixed(2)) };
}
