export type WfdTokenStatus = 'correct' | 'missing' | 'extra' | 'substitution';

export type WfdComparedToken = {
  status: WfdTokenStatus;
  expected?: string;
  actual?: string;
  expectedIndex?: number;
  actualIndex?: number;
};

export type WfdComparisonResult = {
  expectedRaw: string;
  actualRaw: string;
  expectedNormalized: string;
  actualNormalized: string;
  expectedTokens: string[];
  actualTokens: string[];
  tokens: WfdComparedToken[];
  correctCount: number;
  missingCount: number;
  extraCount: number;
  substitutionCount: number;
  expectedWordCount: number;
  actualWordCount: number;
};

export type WfdScoreResult = {
  correctWords: number;
  expectedWords: number;
  actualWords: number;
  wordAccuracy: number;
  wordAccuracyPercent: number;
  missingRate: number;
  extraRate: number;
  substitutionRate: number;
  totalErrors: number;
  exactMatch: boolean;
};
