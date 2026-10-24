export type HiwScore = Readonly<{
  rawScore: number;
  score: number;
  maxScore: number;
  correctSelections: number;
  incorrectSelections: number;
  missedIncorrectWords: number;
  precision: number;
  recall: number;
  selectedTokenIds: readonly string[];
  correctTokenIds: readonly string[];
  falsePositiveTokenIds: readonly string[];
  missedTokenIds: readonly string[];
}>;
