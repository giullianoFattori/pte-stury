import type { Difficulty, PteTaskType } from '../../../domain/pte/types';
import { MAX_SESSION_ITEMS } from '../../../domain/study-session/types.ts';
export type TaskCountChoice = 'default' | 'max' | 3 | 5 | undefined;
export function taskPracticeQuery(taskType: PteTaskType, difficulty?: Difficulty) {
  return { taskTypes: [taskType], ...(difficulty === undefined ? {} : { difficulties: [difficulty] }) };
}
/** UI convenience only. Max never silently truncates the domain's per-session bound. */
export function taskPracticeCount(choice: TaskCountChoice, capacity: number): number | undefined {
  if (!Number.isSafeInteger(capacity) || capacity <= 0 || choice === undefined) return;
  const count = choice === 'default' ? Math.min(5, capacity) : choice === 'max' ? capacity : choice;
  return count <= capacity && count <= MAX_SESSION_ITEMS ? count : undefined;
}
