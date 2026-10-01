import type { StudySession } from '../../domain/pte/types';
import { db } from '../db/database';

export const studySessionsRepository = {
  async create(session: StudySession) {
    await db.studySessions.add(session);
    return session;
  },

  async update(session: StudySession) {
    await db.studySessions.put(session);
    return session;
  },

  async getById(id: string) {
    return db.studySessions.get(id);
  },

  async getAll() {
    return db.studySessions.toArray();
  },
};
