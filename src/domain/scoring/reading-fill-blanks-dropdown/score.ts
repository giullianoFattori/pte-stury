export type ReadingDropdownBlank = Readonly<{ id: string; answer: string; options: readonly string[] }>;
export type ReadingDropdownBlankResult = Readonly<{ blankId: string; expected: string; actual: string; correct: boolean; unanswered: boolean }>;
export type ReadingDropdownScore = Readonly<{
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  totalBlanks: number;
  rawScore: number;
  maxScore: number;
  accuracy: number;
  accuracyPercent: number;
  exactAllCorrect: boolean;
  results: readonly ReadingDropdownBlankResult[];
}>;

/** Exact option text only. The empty string represents an unanswered placeholder. */
export function scoreReadingFillBlanksDropdown(
  blanks: readonly ReadingDropdownBlank[],
  answers: Readonly<Record<string, string>>,
): ReadingDropdownScore {
  if (!Array.isArray(blanks) || blanks.length === 0) throw new Error('Dropdown scoring requires at least one authored blank.');
  if (!answers || typeof answers !== 'object' || Array.isArray(answers) || ![Object.prototype, null].includes(Object.getPrototypeOf(answers))) throw new Error('Dropdown answers must be a plain response map.');
  const ids = blanks.map(blank => blank.id);
  if (ids.some(id => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) throw new Error('Dropdown blank IDs must be non-empty and unique.');
  if (Object.keys(answers).length !== ids.length || Object.keys(answers).some(id => !ids.includes(id))) throw new Error('Dropdown answers must contain exactly the authored blank IDs.');
  const results = blanks.map(blank => {
    if (typeof blank.answer !== 'string' || !Array.isArray(blank.options) || blank.options.length < 2 || new Set(blank.options).size !== blank.options.length || !blank.options.includes(blank.answer)) throw new Error(`Dropdown blank ${blank.id} has invalid authored options or answer.`);
    const actual = answers[blank.id];
    if (typeof actual !== 'string' || actual.length > 200 || actual !== '' && !blank.options.includes(actual)) throw new Error(`Dropdown blank ${blank.id} has an invalid selected option.`);
    const unanswered = actual === '';
    return Object.freeze({ blankId: blank.id, expected: blank.answer, actual, correct: !unanswered && actual === blank.answer, unanswered });
  });
  const correctCount = results.filter(result => result.correct).length;
  const unansweredCount = results.filter(result => result.unanswered).length;
  const totalBlanks = blanks.length, incorrectCount = totalBlanks - correctCount - unansweredCount;
  const accuracy = correctCount / totalBlanks;
  return Object.freeze({ correctCount, incorrectCount, unansweredCount, totalBlanks, rawScore: correctCount, maxScore: totalBlanks, accuracy, accuracyPercent: accuracy * 100, exactAllCorrect: correctCount === totalBlanks, results: Object.freeze(results) });
}
