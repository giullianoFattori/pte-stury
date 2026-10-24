import type { SummarizeWrittenTextItemData } from '../../pte/taskData.ts';
import { calculateAuthoredCoverage } from '../shared/lexicalCoverage.ts';
import { countWords } from '../shared/writing/wordCount.ts';
import type { SwtContentCoverage } from './types.ts';
/** Lexical evidence for authored points; referenceSummary is intentionally not used. */
export function calculateSummarizeWrittenTextCoverage(response:string,data:Pick<SummarizeWrittenTextItemData,'keyPoints'>):SwtContentCoverage {
  const result=calculateAuthoredCoverage(response,data.keyPoints);
  return Object.freeze({keyPointCoverage:result.coverage,keyPointCoveragePercent:result.coveragePercent,matchedKeyPoints:result.matched,totalKeyPoints:result.total,matches:result.matches,responseWordCount:countWords(response)});
}
