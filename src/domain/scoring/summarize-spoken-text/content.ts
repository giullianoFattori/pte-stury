import { calculateAuthoredCoverage } from '../shared/lexicalCoverage.ts';
import { countWords } from '../shared/writing/wordCount.ts';
import type { SummarizeSpokenTextItemData } from '../../pte/taskData.ts';
import type { SstContentCoverage } from './types.ts';
/** Lexical evidence from authored points; neither transcript overlap nor semantic understanding. */
export function calculateSummarizeSpokenTextCoverage(response:string,data:SummarizeSpokenTextItemData):SstContentCoverage{
 const coverage=calculateAuthoredCoverage(response,data.keyPoints);
 return Object.freeze({keyPointCoverage:coverage.coverage,keyPointCoveragePercent:coverage.coveragePercent,matchedKeyPoints:coverage.matched,totalKeyPoints:coverage.total,matches:coverage.matches,responseWordCount:countWords(response)});
}
