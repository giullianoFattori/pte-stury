import type { Attempt, ErrorCategory, ErrorRecord } from '../../../domain/pte/types';
import type { RepeatSentenceComparisonResult, RsComparedToken } from '../../../domain/scoring/repeat-sentence';

function mapCategory(token: RsComparedToken): ErrorCategory | null {
  switch (token.status) {
    case 'missing': return 'omission';
    case 'extra': return 'insertion';
    case 'substitution': return 'substitution';
    case 'correct': return null;
  }
}

function buildExplanation(token: RsComparedToken): string | undefined {
  switch (token.status) {
    case 'missing':
      return token.expected
        ? `Expected word "${token.expected}" was not detected in the spoken response.` : undefined;
    case 'extra':
      return token.actual
        ? `Extra word "${token.actual}" was detected in the spoken response.` : undefined;
    case 'substitution':
      return token.expected && token.actual
        ? `"${token.actual}" was detected instead of "${token.expected}".` : undefined;
    case 'correct': return undefined;
  }
}

export function buildRepeatSentenceErrorRecords(
  attempt: Attempt, comparison: RepeatSentenceComparisonResult,
): ErrorRecord[] {
  return comparison.tokens.flatMap((token): ErrorRecord[] => {
    const category = mapCategory(token);
    if (!category) return [];
    return [{
      id: crypto.randomUUID(),
      attemptId: attempt.id,
      itemId: attempt.itemId,
      taskType: attempt.taskType,
      skills: ['listening', 'speaking'],
      category,
      token: token.expected ?? token.actual,
      expected: token.expected,
      actual: token.actual,
      expectedIndex: token.expectedIndex,
      actualIndex: token.actualIndex,
      explanation: buildExplanation(token),
      severity: 1,
      createdAt: attempt.createdAt,
    }];
  });
}
