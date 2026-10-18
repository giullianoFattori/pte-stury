import type { RetellLectureItemData } from '../pte/taskData';

/** Lexical coverage is deliberately modest and transparent; it is not semantic or Pearson scoring. */
export const RETELL_LECTURE_MATCH_CONFIG = Object.freeze({ minimumAnchors: 2, requiredFraction: 0.6, longPauseMs: 500 });
const STOP_WORDS = new Set('a an and are as at be been but by for from had has have he her his i in is it its of on or our she that the their them there these they this to was we were which who will with you your'.split(' '));
export type KeyPointMatch = Readonly<{ keyPoint: string; matched: boolean; matchedTerms: readonly string[]; requiredTerms: readonly string[] }>;
export type RetellLectureCoverage = Readonly<{ keyPointCoverage: number; keyPointCoveragePercent: number; matchedKeyPoints: number; totalKeyPoints: number; keywordCoverage: number; keywordCoveragePercent: number; responseWordCount: number; matches: readonly KeyPointMatch[] }>;
function terms(text: string): string[] {
  return [...new Set(text.normalize('NFKC').toLocaleLowerCase('en').replace(/[’']/gu, '').match(/[\p{L}\p{N}]+/gu) ?? [])];
}
function anchors(text: string): string[] { return terms(text).filter(term => !STOP_WORDS.has(term)); }
export function calculateRetellLectureCoverage(response: string, data: Pick<RetellLectureItemData, 'keyPoints'|'keywords'>): RetellLectureCoverage {
  const responseTerms = new Set(terms(response));
  const matches = data.keyPoints.map(keyPoint => {
    const requiredTerms = anchors(keyPoint);
    const threshold = Math.min(requiredTerms.length, Math.max(1, RETELL_LECTURE_MATCH_CONFIG.minimumAnchors, Math.ceil(requiredTerms.length * RETELL_LECTURE_MATCH_CONFIG.requiredFraction)));
    const matchedTerms = requiredTerms.filter(term => responseTerms.has(term));
    return Object.freeze({ keyPoint, matched: requiredTerms.length > 0 && matchedTerms.length >= threshold, matchedTerms: Object.freeze(matchedTerms), requiredTerms: Object.freeze(requiredTerms) });
  });
  const matchedKeyPoints = matches.filter(match => match.matched).length;
  const keyPointCoverage = matches.length ? matchedKeyPoints / matches.length : 0;
  const keywords = data.keywords?.length ? [...new Set(data.keywords.flatMap(anchors))] : [];
  const keywordCoverage = keywords.length ? keywords.filter(word => responseTerms.has(word)).length / keywords.length : 0;
  return Object.freeze({ keyPointCoverage, keyPointCoveragePercent: keyPointCoverage * 100, matchedKeyPoints, totalKeyPoints: matches.length, keywordCoverage, keywordCoveragePercent: keywordCoverage * 100, responseWordCount: terms(response).length, matches: Object.freeze(matches) });
}
