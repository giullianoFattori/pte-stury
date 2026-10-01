import type { Attempt, ErrorRecord, ReviewItem } from '../../domain/pte/types';
import { db } from '../db/database';

type SaveStudyOutcomeInput = {
  attempt: Attempt;
  errors: ErrorRecord[];
  reviews: ReviewItem[];
};

export const studyOutcomeRepository = {
  async createStudyOutcome({ attempt, errors, reviews }: SaveStudyOutcomeInput) {
    await db.transaction('rw', db.attempts, db.errors, db.reviews, async () => {
      await db.attempts.add(attempt);
      if (errors.length > 0) {
        await db.errors.bulkAdd(errors);
      }
      if (reviews.length > 0) {
        await db.reviews.bulkAdd(reviews);
      }
    });

    return { attempt, errors, reviews };
  },
};
