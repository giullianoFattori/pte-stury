import type { Attempt } from '../../domain/pte/types';
import { db, type PteDatabase } from '../db/database.ts';

export function createAttemptsRepository(database: PteDatabase = db) {
  return {
    async create(attempt: Attempt) {
      await database.attempts.add(attempt);
      return attempt;
    },

    async getById(id: string) {
      return database.attempts.get(id);
    },

    // Preserve requested order and missing slots: callers must never average partial results.
    async getByIds(ids: readonly string[]): Promise<(Attempt | undefined)[]> {
      return database.attempts.bulkGet([...ids]);
    },

    async getByItemId(itemId: string) {
      return database.attempts.where('itemId').equals(itemId).toArray();
    },

    async getAll() {
      return database.attempts.toArray();
    },
  };
}
export const attemptsRepository = createAttemptsRepository();
