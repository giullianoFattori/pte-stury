import type { RetellLectureItemData } from '../pte/taskData';
import { calculateAuthoredCoverage, lexicalTerms, meaningfulTerms, matchAuthoredTerms, type AuthoredTermMatch } from './shared/lexicalCoverage.ts';
import { tokenizeText } from './shared/tokenizeText.ts';

/** Lexical coverage is deliberately modest and transparent; it is not semantic or Pearson scoring. */
export const RETELL_LECTURE_MATCH_CONFIG = Object.freeze({ minimumAnchors: 2, requiredFraction: 0.6, longPauseMs: 500 });
export type KeyPointMatch = AuthoredTermMatch;
export type RetellLectureCoverage = Readonly<{ keyPointCoverage: number; keyPointCoveragePercent: number; matchedKeyPoints: number; totalKeyPoints: number; keywordCoverage: number; keywordCoveragePercent: number; responseWordCount: number; matches: readonly KeyPointMatch[] }>;
export function matchAuthoredKeyPoint(responseTerms: ReadonlySet<string>, keyPoint: string): KeyPointMatch { return matchAuthoredTerms(responseTerms,keyPoint); }
export function calculateRetellLectureCoverage(response: string, data: Pick<RetellLectureItemData, 'keyPoints'|'keywords'>): RetellLectureCoverage {
  const result=calculateAuthoredCoverage(response,data.keyPoints), responseTerms=new Set(lexicalTerms(response)), keywords=data.keywords?.length?[...new Set(data.keywords.flatMap(meaningfulTerms))]:[], matchedKeywords=keywords.filter(word=>responseTerms.has(word)).length;
  return Object.freeze({ keyPointCoverage:result.coverage,keyPointCoveragePercent:result.coveragePercent,matchedKeyPoints:result.matched,totalKeyPoints:result.total,keywordCoverage:keywords.length?matchedKeywords/keywords.length:0,keywordCoveragePercent:keywords.length?100*matchedKeywords/keywords.length:0,responseWordCount:new Set(tokenizeText(response)).size,matches:result.matches });
}
