import { scoreExactBlankChoices, type ExactBlankScore } from '../shared/blankChoices.ts';
export type ReadingDropdownBlank = Readonly<{ id: string; answer: string; options: readonly string[] }>;
export type ReadingDropdownBlankResult = ExactBlankScore['results'][number];
export type ReadingDropdownScore = ExactBlankScore;

/** Exact option text only. The empty string represents an unanswered placeholder. */
export function scoreReadingFillBlanksDropdown(
  blanks: readonly ReadingDropdownBlank[],
  answers: Readonly<Record<string, string>>,
): ReadingDropdownScore {
  return scoreExactBlankChoices(blanks, answers, blank => {
    if (!Array.isArray(blank.options) || blank.options.length < 2) throw new Error(`Dropdown blank ${blank.id} needs at least two options.`);
    return blank.options;
  });
}
