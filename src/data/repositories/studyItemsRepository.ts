import type { StudyItem } from '../../domain/pte/types';
import { db } from '../db/database.ts';
import { isPracticeEligible } from '../../domain/content/installedContent.ts';

export const studyItemsRepository = {
  async create(item: StudyItem) {
    await db.studyItems.add(item);
    return item;
  },

  async upsert(item: StudyItem) {
    await db.studyItems.put(item);
    return item;
  },

  async getById(id: string) {
    return db.studyItems.get(id);
  },

  async getAll() {
    return db.studyItems.toArray();
  },

  async getByTaskType(taskType: StudyItem['taskType']) {
    return db.studyItems.where('taskType').equals(taskType).filter(isPracticeEligible).toArray();
  },
};
