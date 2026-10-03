import type { ComparedToken, TokenStatus } from '../shared/types';

export type RsTokenStatus = TokenStatus;
export type RsComparedToken = ComparedToken;

export type RepeatSentenceComparisonResult = {
  expectedRaw: string;
  actualRaw: string;
  expectedNormalized: string;
  actualNormalized: string;
  expectedTokens: string[];
  actualTokens: string[];
  tokens: RsComparedToken[];
  correctCount: number;
  missingCount: number;
  extraCount: number;
  substitutionCount: number;
  expectedWordCount: number;
  actualWordCount: number;
};

export type RepeatSentenceScoreResult = {
  correctWords: number;
  expectedWords: number;
  actualWords: number;
  contentRecall: number;
  contentRecallPercent: number;
  missingRate: number;
  extraRate: number;
  substitutionRate: number;
  sequenceAccuracy: number;
  sequenceAccuracyPercent: number;
  totalErrors: number;
  exactContentMatch: boolean;
};

export type RsChunkResult = {
  index: number;
  text: string;
  expectedWords: number;
  correctWords: number;
  recall: number;
  recallPercent: number;
  retained: boolean;
};

export type RsChunkAnalysis = {
  chunks: RsChunkResult[];
  retainedChunks: number;
  totalChunks: number;
  chunkRetention: number;
  chunkRetentionPercent: number;
};
