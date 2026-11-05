import type { WriteEssayItemData } from '../../pte/taskData.ts';
import { calculateAuthoredCoverage } from '../shared/lexicalCoverage.ts';
import type { EssayRequirementCoverage } from './types.ts';

/** Lexical evidence for prompt requirements; it does not assess reasoning or correctness. */
export function calculateEssayRequirementCoverage(response: string, data: Pick<WriteEssayItemData, 'keyRequirements'>): EssayRequirementCoverage {
  const result = calculateAuthoredCoverage(response, data.keyRequirements);
  return Object.freeze({ matchedRequirements: result.matched, totalRequirements: result.total, coverage: result.coverage, coveragePercent: result.coveragePercent, matches: result.matches });
}
