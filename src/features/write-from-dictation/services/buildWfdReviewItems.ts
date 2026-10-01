import type { Attempt, ErrorRecord, ReviewItem, StudyItem } from '../../../domain/pte/types';
import { createInitialReviewSchedule } from '../../../domain/scheduler/createInitialReviewSchedule.ts';
import { createWfdClozePrompt } from './createWfdClozePrompt.ts';

type BuildWfdReviewItemsInput = {
  question: StudyItem;
  attempt: Attempt;
  errors: ErrorRecord[];
};

export function buildWfdReviewItems({
  question, attempt, errors,
}: BuildWfdReviewItemsInput): ReviewItem[] {
  const expectedSentence = question.answer;
  if (!expectedSentence) {
    return [];
  }

  const schedule = createInitialReviewSchedule(attempt.createdAt);
  return errors.flatMap((error): ReviewItem[] => {
    let content: Pick<ReviewItem, 'type' | 'prompt' | 'answer'>;

    if ((error.category === 'omission' || error.category === 'substitution')
      && error.expected && error.expectedIndex !== undefined) {
      const prompt = createWfdClozePrompt(expectedSentence, error.expectedIndex);
      // Invalid positions cannot produce a useful retrieval prompt.
      if (prompt === expectedSentence) {
        return [];
      }
      content = { type: 'word', prompt, answer: error.expected };
    } else if (error.category === 'insertion' && attempt.responseText) {
      content = {
        type: 'sentence',
        prompt: `Rewrite the sentence correctly: ${attempt.responseText}`,
        answer: expectedSentence,
      };
    } else {
      return [];
    }

    return [{
      id: crypto.randomUUID(),
      sourceAttemptId: attempt.id,
      sourceErrorId: error.id,
      itemId: question.id,
      taskType: question.taskType,
      ...content,
      ...schedule,
      createdAt: attempt.createdAt,
    }];
  });
}
