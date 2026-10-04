import type { ComparedToken } from '../shared/types';

export type RaComparedToken = ComparedToken;

export type ReadAloudComparisonResult = {
  expectedRaw: string;
  actualRaw: string;
  expectedNormalized: string;
  actualNormalized: string;
  expectedTokens: string[];
  actualTokens: string[];
  tokens: RaComparedToken[];
  correctCount: number;
  missingCount: number;
  extraCount: number;
  substitutionCount: number;
  expectedWordCount: number;
  actualWordCount: number;
};

export type ReadAloudContentMetrics = {
  correctWords: number;
  expectedWords: number;
  actualWords: number;
  textCoverage: number;
  textCoveragePercent: number;
  omissionRate: number;
  insertionRate: number;
  substitutionRate: number;
  exactTextMatch: boolean;
  totalErrors: number;
};
