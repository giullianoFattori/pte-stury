import type { AuthoredTermMatch } from '../shared/lexicalCoverage.ts';

export type EssayFormResult = Readonly<{
  wordCount: number;
  formPoints: 0 | 1 | 2;
  formCredit: 0 | 0.5 | 1;
  targetRange: boolean;
  partialRange: boolean;
  zeroRange: boolean;
  allCaps: boolean;
  hasPunctuation: boolean;
  bulletLike: boolean;
  veryShortSentencePattern: boolean;
  zeroFormReason?: 'too-short' | 'too-long' | 'all-caps' | 'no-punctuation' | 'bullet-like' | 'very-short-sentences';
}>;

export type EssayRequirementCoverage = Readonly<{
  matchedRequirements: number;
  totalRequirements: number;
  coverage: number;
  coveragePercent: number;
  matches: readonly AuthoredTermMatch[];
}>;

export type EssayStructureDiagnostics = Readonly<{
  paragraphCount: number;
  hasIntroductionLikeOpening: boolean;
  hasConclusionSignal: boolean;
  averageParagraphWords: number;
  transitionSignals: readonly string[];
}>;

export type EssayWritingMechanics = Readonly<{
  sentenceCount: number;
  startsWithCapital: boolean;
  endsWithTerminalPunctuation: boolean;
  duplicatePunctuation: boolean;
}>;

export type WriteEssayAnalysis = Readonly<{
  form: EssayFormResult;
  requirements: EssayRequirementCoverage;
  structure: EssayStructureDiagnostics;
  mechanics: EssayWritingMechanics;
}>;
