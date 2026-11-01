import { scoreExactBlankChoices, type ExactBlankScore } from '../shared/blankChoices.ts';

export type ReadingDragDropBlank = Readonly<{ id: string; answer: string }>;
export type ReadingDragDropScore = ExactBlankScore;

/** Exact authored word-bank scoring; each bank word can fill at most one gap. */
export function scoreReadingFillBlanksDragDrop(
  blanks: readonly ReadingDragDropBlank[], assignments: Readonly<Record<string, string>>, wordBank: readonly string[],
): ReadingDragDropScore {
  if (!Array.isArray(wordBank) || wordBank.length <= blanks.length || new Set(wordBank).size !== wordBank.length) throw new Error('Drag-and-drop scoring requires a unique word bank with distractors.');
  return scoreExactBlankChoices(blanks, assignments, () => wordBank, true);
}
