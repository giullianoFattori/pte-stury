export type TokenStatus = 'correct' | 'missing' | 'extra' | 'substitution';

export type ComparedToken = {
  status: TokenStatus;
  expected?: string;
  actual?: string;
  expectedIndex?: number;
  actualIndex?: number;
};
