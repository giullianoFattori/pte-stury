export type ExactBlank = Readonly<{ id: string; answer: string }>;
export type ExactBlankResult = Readonly<{ blankId: string; expected: string; actual: string; correct: boolean; unanswered: boolean }>;
export type ExactBlankScore = Readonly<{
  correctCount: number; incorrectCount: number; unansweredCount: number; totalBlanks: number;
  rawScore: number; maxScore: number; accuracy: number; accuracyPercent: number; exactAllCorrect: boolean;
  results: readonly ExactBlankResult[];
}>;

/** Shared exact +1/0 blank scoring. Task wrappers supply the allowed value set for each blank. */
export function scoreExactBlankChoices<T extends ExactBlank>(
  blanks: readonly T[], answers: Readonly<Record<string, string>>,
  allowedValues: (blank: T) => readonly string[], uniqueAssignments = false,
): ExactBlankScore {
  if (!Array.isArray(blanks) || blanks.length === 0) throw new Error('Blank scoring requires at least one authored blank.');
  if (!answers || typeof answers !== 'object' || Array.isArray(answers) || ![Object.prototype, null].includes(Object.getPrototypeOf(answers))
    || Reflect.ownKeys(answers).some(key => typeof key !== 'string' || !Object.getOwnPropertyDescriptor(answers, key)?.enumerable || !Object.hasOwn(Object.getOwnPropertyDescriptor(answers, key)!, 'value'))) throw new Error('Blank answers must be a plain response map.');
  const ids = blanks.map(blank => blank.id);
  if (ids.some(id => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) throw new Error('Blank IDs must be non-empty and unique.');
  const keys = Object.keys(answers);
  if (keys.length !== ids.length || keys.some(id => !ids.includes(id))) throw new Error('Answers must contain exactly the authored blank IDs.');
  const results = blanks.map(blank => {
    if (typeof blank.answer !== 'string' || !blank.answer.trim()) throw new Error(`Blank ${blank.id} has no authored answer.`);
    const options = allowedValues(blank);
    if (!Array.isArray(options) || options.length < 1 || options.some(option => typeof option !== 'string' || !option.trim()) || new Set(options).size !== options.length || !options.includes(blank.answer)) throw new Error(`Blank ${blank.id} has invalid allowed values.`);
    const actual = answers[blank.id];
    if (typeof actual !== 'string' || actual.length > 200 || actual !== '' && !options.includes(actual)) throw new Error(`Blank ${blank.id} has an invalid selected value.`);
    return Object.freeze({ blankId: blank.id, expected: blank.answer, actual, correct: actual !== '' && actual === blank.answer, unanswered: actual === '' });
  });
  const assigned = results.filter(result => result.actual !== '').map(result => result.actual);
  if (uniqueAssignments && new Set(assigned).size !== assigned.length) throw new Error('A word-bank value cannot be assigned to more than one blank.');
  const correctCount = results.filter(result => result.correct).length, unansweredCount = results.filter(result => result.unanswered).length;
  const totalBlanks = blanks.length, incorrectCount = totalBlanks - correctCount - unansweredCount, accuracy = correctCount / totalBlanks;
  return Object.freeze({ correctCount, incorrectCount, unansweredCount, totalBlanks, rawScore: correctCount, maxScore: totalBlanks, accuracy, accuracyPercent: accuracy * 100, exactAllCorrect: correctCount === totalBlanks, results: Object.freeze(results) });
}
