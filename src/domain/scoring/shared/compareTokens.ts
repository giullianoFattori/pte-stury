import type { ComparedToken } from './types';

export function compareTokens(expected: string[], actual: string[]): ComparedToken[] {
  const matrix = Array.from(
    { length: expected.length + 1 },
    () => Array<number>(actual.length + 1).fill(0),
  );

  for (let i = expected.length - 1; i >= 0; i -= 1) {
    for (let j = actual.length - 1; j >= 0; j -= 1) {
      matrix[i][j] = expected[i] === actual[j]
        ? matrix[i + 1][j + 1] + 1
        : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
    }
  }

  const tokens: ComparedToken[] = [];
  let i = 0;
  let j = 0;

  while (i < expected.length && j < actual.length) {
    if (expected[i] === actual[j]) {
      tokens.push({
        status: 'correct', expected: expected[i], actual: actual[j],
        expectedIndex: i, actualIndex: j,
      });
      i += 1;
      j += 1;
    } else if (matrix[i + 1][j] > matrix[i][j + 1]) {
      tokens.push({ status: 'missing', expected: expected[i], expectedIndex: i });
      i += 1;
    } else if (matrix[i][j + 1] > matrix[i + 1][j]) {
      tokens.push({ status: 'extra', actual: actual[j], actualIndex: j });
      j += 1;
    } else {
      // V1 tie policy: equally sized LCS branches are treated as a substitution.
      tokens.push({
        status: 'substitution', expected: expected[i], actual: actual[j],
        expectedIndex: i, actualIndex: j,
      });
      i += 1;
      j += 1;
    }
  }

  while (i < expected.length) {
    tokens.push({ status: 'missing', expected: expected[i], expectedIndex: i });
    i += 1;
  }

  while (j < actual.length) {
    tokens.push({ status: 'extra', actual: actual[j], actualIndex: j });
    j += 1;
  }

  return tokens;
}
