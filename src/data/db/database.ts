import Dexie, { type Table } from 'dexie';

import type {
  Attempt,
  ErrorRecord,
  ReviewItem,
  StudyItem,
  StudySession,
} from '../../domain/pte/types';
import type { InstalledContentState } from '../../domain/content/installedContent';

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
  contentState!: Table<InstalledContentState, string>;

  constructor(name = 'pte-study-db') {
    super(name);

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
    // Add internal catalog state only. Existing v2 rows stay revision-unknown.
    // Boolean availability is not a valid IndexedDB index key.
    this.version(3).stores({ contentState: 'key' });
  }
}

export const db = new PteDatabase();
