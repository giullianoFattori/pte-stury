import type { AuthoredTermMatch } from '../shared/lexicalCoverage.ts';
export type SwtFormResult = Readonly<{
  wordCount: number; withinWordLimit: boolean; singleSentence: boolean; sentenceCount: number;
  startsWithCapital: boolean; endsWithTerminalPunctuation: boolean; allCaps: boolean;
  duplicatePunctuation: boolean; formValid: boolean;
}>;
export type SwtContentCoverage = Readonly<{
  keyPointCoverage: number; keyPointCoveragePercent: number; matchedKeyPoints: number;
  totalKeyPoints: number; matches: readonly AuthoredTermMatch[]; responseWordCount: number;
}>;
export type SwtAnalysis = Readonly<{ form: SwtFormResult; content: SwtContentCoverage; copy: Readonly<{sourceCopyRatio:number;sourceCopyPercent:number;longestCopiedRunWords:number}>; passageWordCount:number; compressionRatio:number }>;
