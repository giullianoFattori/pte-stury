import type { ErrorRecord } from '../../domain/pte/types';
import { db } from '../db/database';

export const errorsRepository = {
  async create(error: ErrorRecord) {
    await db.errors.add(error);
    return error;
  },

  async getByAttemptId(attemptId: string) {
    return db.errors.where('attemptId').equals(attemptId).toArray();
  },

  async getAll() {
    return db.errors.toArray();
  },
};
