import type { Attempt, ErrorRecord } from '../../domain/pte/types';
import { db } from '../db/database';

type SaveAttemptWithErrorsInput = {
  attempt: Attempt;
  errors: ErrorRecord[];
};

export const studyOutcomeRepository = {
  async createAttemptWithErrors({ attempt, errors }: SaveAttemptWithErrorsInput) {
    await db.transaction('rw', db.attempts, db.errors, async () => {
      await db.attempts.add(attempt);
      if (errors.length > 0) {
        await db.errors.bulkAdd(errors);
      }
    });

    return { attempt, errors };
  },
};
