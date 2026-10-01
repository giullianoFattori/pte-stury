import type { Attempt } from '../../domain/pte/types';
import { db } from '../db/database';

export const attemptsRepository = {
  async create(attempt: Attempt) {
    await db.attempts.add(attempt);
    return attempt;
  },

  async getById(id: string) {
    return db.attempts.get(id);
  },

  async getByItemId(itemId: string) {
    return db.attempts.where('itemId').equals(itemId).toArray();
  },

  async getAll() {
    return db.attempts.toArray();
  },
};
