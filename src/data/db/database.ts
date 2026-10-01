import Dexie, { type Table } from 'dexie';

import type {
  Attempt,
  ErrorRecord,
  ReviewItem,
  StudyItem,
  StudySession,
} from '../../domain/pte/types';

export type AppSetting = {
  key: string;
  value: unknown;
};

export class PteDatabase extends Dexie {
  settings!: Table<AppSetting, string>;
  studyItems!: Table<StudyItem, string>;
  attempts!: Table<Attempt, string>;
  errors!: Table<ErrorRecord, string>;
  reviews!: Table<ReviewItem, string>;
  studySessions!: Table<StudySession, string>;

  constructor() {
    super('pte-study-db');

    this.version(1).stores({
      settings: 'key',
    });

    this.version(2).stores({
      settings: 'key',
      studyItems: 'id, taskType, difficulty',
      attempts: 'id, itemId, taskType, createdAt',
      errors: 'id, attemptId, itemId, taskType, category, createdAt',
      reviews: 'id, sourceAttemptId, sourceErrorId, dueAt',
      studySessions: 'id, startedAt',
    });
  }
}

export const db = new PteDatabase();
