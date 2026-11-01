import type { ListeningBlank } from '../../pte/taskData.ts';

export type ListeningBlankResult = Readonly<{ blankId: string; expected: string; actual: string; correct: boolean; unanswered: boolean }>;
export type ListeningFillBlanksScore = Readonly<{
  correctCount: number; incorrectCount: number; unansweredCount: number; totalBlanks: number;
  rawScore: number; maxScore: number; accuracy: number; accuracyPercent: number;
  exactAllCorrect: boolean; results: readonly ListeningBlankResult[];
}>;

function normalized(value: string): string { return value.normalize('NFC').trim().toLocaleLowerCase('en'); }

/** Exact authored-word scoring: case-insensitive NFC/trim only; spelling and morphology remain strict. */
export function scoreListeningFillBlanks(blanks: readonly ListeningBlank[], answers: Readonly<Record<string, string>>): ListeningFillBlanksScore {
  if (!blanks.length || new Set(blanks.map(blank => blank.id)).size !== blanks.length) throw new Error('Listening blanks must have unique IDs.');
  const ids = new Set(blanks.map(blank => blank.id));
  if (Object.keys(answers).length !== ids.size || Object.keys(answers).some(id => !ids.has(id))) throw new Error('Answers must contain exactly the authored blank IDs.');
  for (const [id, value] of Object.entries(answers)) if (typeof value !== 'string' || value.length > 200) throw new Error(`Invalid answer for blank ${id}.`);
  const results = blanks.map(blank => {
    const actual = answers[blank.id];
    const unanswered = normalized(actual) === '';
    return Object.freeze({ blankId: blank.id, expected: blank.answer, actual, correct: !unanswered && normalized(actual) === normalized(blank.answer), unanswered });
  });
  const correctCount = results.filter(result => result.correct).length;
  const unansweredCount = results.filter(result => result.unanswered).length;
  const totalBlanks = blanks.length;
  const incorrectCount = totalBlanks - correctCount - unansweredCount;
  const accuracy = correctCount / totalBlanks;
  return Object.freeze({ correctCount, incorrectCount, unansweredCount, totalBlanks, rawScore: correctCount, maxScore: totalBlanks, accuracy, accuracyPercent: accuracy * 100, exactAllCorrect: correctCount === totalBlanks, results: Object.freeze(results) });
}
