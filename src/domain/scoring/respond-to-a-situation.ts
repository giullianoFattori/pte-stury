import type { RespondToSituationItemData } from '../pte/taskData';
import { calculateAuthoredCoverage, lexicalTerms, type AuthoredTermMatch } from './shared/lexicalCoverage.ts';

export const RESPOND_TO_SITUATION_MATCH_CONFIG = Object.freeze({ longPauseMs: 500 });
export type RespondToSituationCoverage = Readonly<{
  requiredPointCoverage: number; requiredPointCoveragePercent: number;
  matchedRequiredPoints: number; totalRequiredPoints: number;
  requiredPointMatches: readonly AuthoredTermMatch[];
  communicationGoalDetected: boolean; matchedFunctions: readonly string[];
}>;
/** Lexical evidence against authored requirements only; it does not judge human-equivalent appropriateness. */
export function calculateRespondToSituationCoverage(response: string, data: Pick<RespondToSituationItemData, 'requiredPoints'|'scenario'|'usefulFunctions'>): RespondToSituationCoverage {
  const authored = calculateAuthoredCoverage(response, data.requiredPoints);
  const terms = new Set(lexicalTerms(response));
  const goal = lexicalTerms(data.scenario.communicationGoal).filter(term => term.length > 3);
  const matchedFunctions = (data.usefulFunctions ?? []).filter(fn => {
    const normalized = fn.toLocaleLowerCase('en').replaceAll('-', ' ');
    return normalized.split(/\s+/u).some(term => terms.has(term));
  });
  return Object.freeze({ requiredPointCoverage: authored.coverage, requiredPointCoveragePercent: authored.coveragePercent,
    matchedRequiredPoints: authored.matched, totalRequiredPoints: authored.total, requiredPointMatches: authored.matches,
    communicationGoalDetected: goal.length > 0 && goal.filter(term => terms.has(term)).length >= Math.min(2, goal.length),
    matchedFunctions: Object.freeze(matchedFunctions) });
}

export type RegisterDiagnostic = Readonly<{ expected: 'formal'|'neutral'|'informal'; detectedSignals: readonly string[]; warning?: string }>;
const POLITE = ['please','could you','would you','thank you','i would appreciate','i am sorry'] as const;
const CASUAL = ['hey','gonna','wanna','yeah','no worries','mate'] as const;
/** Explicit phrase signals only; this is not a sociolinguistic or official appropriateness score. */
export function diagnoseSituationRegister(response: string, expected: RegisterDiagnostic['expected']): RegisterDiagnostic {
  const normalized = response.normalize('NFKC').toLocaleLowerCase('en');
  const polite = POLITE.filter(signal => normalized.includes(signal));
  const casual = CASUAL.filter(signal => normalized.includes(signal));
  const detectedSignals = Object.freeze([...polite, ...casual]);
  const warning = expected === 'formal' && casual.length ? 'Some explicitly casual phrases may not fit the requested register.'
    : expected === 'informal' && polite.length > 1 ? 'The response includes several formal politeness phrases.' : undefined;
  return Object.freeze({ expected, detectedSignals, ...(warning ? { warning } : {}) });
}
