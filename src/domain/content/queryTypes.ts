import type { Difficulty, PteTaskType, Skill } from '../pte/types';

export type StudyItemQuery = Readonly<{
  taskTypes?: readonly PteTaskType[];
  difficulties?: readonly Difficulty[];
  skills?: readonly Skill[];
  tags?: readonly string[];
  topic?: string;
  excludeIds?: readonly string[];
  matchSkills?: 'any' | 'all';
  matchTags?: 'any' | 'all';
  limit?: number;
}>;
export type QueryIssue = Readonly<{ path: string; code: string; message: string }>;
export class StudyItemQueryError extends Error {
  readonly issues: readonly QueryIssue[];
  constructor(issues: readonly QueryIssue[]) {
    super('Invalid study item query.'); this.name = 'StudyItemQueryError'; this.issues = issues;
  }
}
