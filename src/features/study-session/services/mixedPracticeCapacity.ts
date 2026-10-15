import type { Difficulty, PteTaskType } from '../../../domain/pte/types';
import { TASK_ORDER } from '../../../domain/content/canonical.ts';
import { emptyTaskCounts } from '../../../domain/study-session/allocation.ts';
import { MAX_SESSION_ITEMS } from '../../../domain/study-session/types.ts';
import { studyItemsRepository } from '../../../data/repositories/studyItemsRepository.ts';

export type MixedCountChoice = 'default' | 'max' | 5 | 10 | undefined;
export async function mixedPracticeCapacity(tasks: readonly PteTaskType[], difficulty?: Difficulty,
  source: Pick<typeof studyItemsRepository, 'countPracticeItems'> = studyItemsRepository) {
  const selected = TASK_ORDER.filter(task => tasks.includes(task));
  const counts = await Promise.all(selected.map(task => source.countPracticeItems({ taskTypes: [task],
    ...(difficulty === undefined ? {} : { difficulties: [difficulty] }) })));
  const byTask = emptyTaskCounts();
  selected.forEach((task, index) => { byTask[task] = counts[index]; });
  return { byTask, total: counts.reduce((sum, count) => sum + count, 0) };
}
export function mixedPracticeCount(choice: MixedCountChoice, capacity: number): number | undefined {
  if (!Number.isSafeInteger(capacity) || capacity <= 0 || choice === undefined) return;
  const count = choice === 'default' ? capacity >= 10 ? 10 : capacity >= 5 ? 5 : capacity
    : choice === 'max' ? capacity : choice;
  return count <= capacity && count <= MAX_SESSION_ITEMS ? count : undefined;
}
