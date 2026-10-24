import type { DescribeImageItemData } from '../pte/taskData';
import { calculateAuthoredCoverage, meaningfulTerms, lexicalTerms, type AuthoredTermMatch } from './shared/lexicalCoverage.ts';
import { tokenizeText } from './shared/tokenizeText.ts';
export type DescribeImageCoverage = Readonly<{ featureCoverage:number;featureCoveragePercent:number;matchedFeatures:number;totalFeatures:number;matches:readonly AuthoredTermMatch[];keywordCoverage:number;keywordCoveragePercent:number;responseWordCount:number }>;
/** Deterministic lexical feature matching; it does not interpret the image or assess Pearson Content. */
export function calculateDescribeImageCoverage(transcript:string,data:Pick<DescribeImageItemData,'keyFeatures'|'keywords'>):DescribeImageCoverage {
  const result=calculateAuthoredCoverage(transcript,data.keyFeatures), responseTerms=new Set(lexicalTerms(transcript)), keywords=data.keywords?.length?[...new Set(data.keywords.flatMap(meaningfulTerms))]:[], matched=keywords.filter(term=>responseTerms.has(term)).length;
  return Object.freeze({featureCoverage:result.coverage,featureCoveragePercent:result.coveragePercent,matchedFeatures:result.matched,totalFeatures:result.total,matches:result.matches,keywordCoverage:keywords.length?matched/keywords.length:0,keywordCoveragePercent:keywords.length?100*matched/keywords.length:0,responseWordCount:new Set(tokenizeText(transcript)).size});
}
