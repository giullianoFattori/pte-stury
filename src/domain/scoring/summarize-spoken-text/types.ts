import type { AuthoredTermMatch } from '../shared/lexicalCoverage.ts';
export type SstZeroFormReason='too-short'|'too-long'|'all-caps'|'no-punctuation'|'bullet-like'|'very-short-sentences';
export type SstFormResult=Readonly<{
 wordCount:number;formPoints:0|1|2;formCredit:0|0.5|1;targetRange:boolean;partialRange:boolean;zeroRange:boolean;
 allCaps:boolean;hasPunctuation:boolean;bulletLike:boolean;veryShortSentencePattern:boolean;zeroFormReason?:SstZeroFormReason;
 sentenceCount:number;startsWithCapital:boolean;endsWithTerminalPunctuation:boolean;duplicatePunctuation:boolean;
}>;
export type SstContentCoverage=Readonly<{keyPointCoverage:number;keyPointCoveragePercent:number;matchedKeyPoints:number;totalKeyPoints:number;matches:readonly AuthoredTermMatch[];responseWordCount:number}>;
export type SstAnalysis=Readonly<{form:SstFormResult;content:SstContentCoverage}>;
