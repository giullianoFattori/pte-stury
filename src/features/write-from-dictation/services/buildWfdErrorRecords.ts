import type { Attempt, ErrorCategory, ErrorRecord } from '../../../domain/pte/types';
import type { WfdComparedToken, WfdComparisonResult } from '../../../domain/scoring/wfd';

function mapCategory(token: WfdComparedToken): ErrorCategory | null {
  switch (token.status) {
    case 'missing': return 'omission';
    case 'extra': return 'insertion';
    case 'substitution': return 'substitution';
    case 'correct': return null;
  }
}

function buildExplanation(token: WfdComparedToken): string | undefined {
  switch (token.status) {
    case 'missing':
      return token.expected
        ? `Expected word "${token.expected}" was missing from the response.`
        : undefined;
    case 'extra':
      return token.actual
        ? `Extra word "${token.actual}" was added to the response.`
        : undefined;
    case 'substitution':
      return token.expected && token.actual
        ? `"${token.actual}" was used instead of "${token.expected}".`
        : undefined;
    case 'correct': return undefined;
  }
}

export function buildWfdErrorRecords(
  attempt: Attempt,
  comparison: WfdComparisonResult,
): ErrorRecord[] {
  return comparison.tokens.flatMap((token): ErrorRecord[] => {
    const category = mapCategory(token);
    if (!category) {
      return [];
    }

    return [{
      id: crypto.randomUUID(),
      attemptId: attempt.id,
      itemId: attempt.itemId,
      taskType: attempt.taskType,
      skills: ['listening', 'writing'],
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
