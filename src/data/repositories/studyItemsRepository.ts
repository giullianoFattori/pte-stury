import type { StudyItem } from '../../domain/pte/types';
import { db, type PteDatabase } from '../db/database.ts';
import { comparePracticeItems, matchesNothing, parseStudyItemQuery, practiceItemPredicate } from '../../domain/content/query.ts';
import type { StudyItemQuery } from '../../domain/content/queryTypes';

export function createStudyItemsRepository(database: PteDatabase = db) {
  const candidates = (query: StudyItemQuery) => {
    const base = query.taskTypes
      ? (query.taskTypes.length === 1
        ? database.studyItems.where('taskType').equals(query.taskTypes[0])
        : database.studyItems.where('taskType').anyOf([...query.taskTypes]))
      : query.difficulties
        ? (query.difficulties.length === 1
          ? database.studyItems.where('difficulty').equals(query.difficulties[0])
          : database.studyItems.where('difficulty').anyOf([...query.difficulties]))
        : database.studyItems.toCollection();
    return base.filter(practiceItemPredicate(query));
  };
  const queryPracticeItems = async (input: unknown = {}) => {
    const query = parseStudyItemQuery(input);
    if (matchesNothing(query)) return [];
    const rows = await candidates(query).toArray();
    rows.sort(comparePracticeItems);
    return query.limit === undefined ? rows : rows.slice(0, query.limit);
  };
  return {
    async create(item: StudyItem) {
      await database.studyItems.add(item);
      return item;
    },

    async upsert(item: StudyItem) {
      await database.studyItems.put(item);
      return item;
    },

    async getById(id: string) {
      return database.studyItems.get(id);
    },

    async getAll() {
      return database.studyItems.toArray();
    },

    async getByTaskType(taskType: StudyItem['taskType']) {
      return queryPracticeItems({ taskTypes: [taskType] });
    },
    queryPracticeItems,
    async countPracticeItems(input: unknown = {}) {
      const query = parseStudyItemQuery(input);
      return matchesNothing(query) ? 0 : candidates(query).count();
    },
    async countPracticeItemsByTaskType() {
      const counts = { 'write-from-dictation': 0, 'repeat-sentence': 0, 'read-aloud': 0 };
      await database.studyItems.filter(practiceItemPredicate({})).each(item => { counts[item.taskType]++; });
      return counts;
    },
    async practiceMetadataCoverage() {
      const coverage = { eligibleItems: 0, missingSkills: 0, missingTags: 0, missingTopic: 0 };
      await database.studyItems.filter(practiceItemPredicate({})).each(item => {
        coverage.eligibleItems++;
        if (!item.skills?.length) coverage.missingSkills++;
        if (!item.tags?.length) coverage.missingTags++;
        if (item.topic === undefined || !item.topic.trim()) coverage.missingTopic++;
      });
      return coverage;
    },
  };
}
export const studyItemsRepository = createStudyItemsRepository();
