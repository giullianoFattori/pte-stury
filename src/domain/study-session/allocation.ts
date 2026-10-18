import { taskRecord } from '../pte/taskRegistry.ts';
import type { PteTaskType } from '../pte/types';
import { TASK_ORDER } from '../content/canonical.ts';
import { MAX_SESSION_ITEMS } from './types.ts';
import { StudySessionError } from './errors.ts';
import { invalidBuildConfig } from './buildRequest.ts';
import type { TaskCounts } from './buildTypes';
export const emptyTaskCounts = (): Record<PteTaskType, number> => taskRecord(() => 0);
export function allocateTaskCounts(itemCount: number, selected: readonly PteTaskType[], capacity: TaskCounts): TaskCounts {
  if (!Number.isSafeInteger(itemCount) || itemCount < 1 || itemCount > MAX_SESSION_ITEMS)
    invalidBuildConfig('itemCount', 'Requested count must be an integer from 1 to 500.');
  if (!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length || selected.some(task => !TASK_ORDER.includes(task)))
    invalidBuildConfig('taskTypes', 'Allocation requires unique implemented tasks.');
  const tasks = TASK_ORDER.filter(task => selected.includes(task));
  const byTask = emptyTaskCounts();
  for (const task of tasks) {
    if (!Number.isSafeInteger(capacity?.[task]) || capacity[task] < 0) invalidBuildConfig('capacity', 'Capacity must contain nonnegative safe-integer counts.');
    byTask[task] = capacity[task];
  }
  const available = tasks.reduce((sum, task) => sum + byTask[task], 0);
  if (!Number.isSafeInteger(available)) invalidBuildConfig('capacity', 'Total capacity exceeds safe-integer bounds.');
  if (available < itemCount) throw new StudySessionError({ path: 'itemCount', code: 'INSUFFICIENT_CONTENT', message: 'Not enough unique eligible questions for the requested session.' },
    { requested: itemCount, available, byTask: Object.freeze(byTask) });
  const allocation = emptyTaskCounts(), base = Math.floor(itemCount / tasks.length), remainder = itemCount % tasks.length;
  tasks.forEach((task, index) => { allocation[task] = Math.min(base + (index < remainder ? 1 : 0), byTask[task]); });
  let deficit = itemCount - tasks.reduce((sum, task) => sum + allocation[task], 0);
  while (deficit > 0) for (const task of tasks) {
    if (deficit && allocation[task] < byTask[task]) { allocation[task]++; deficit--; }
  }
  return Object.freeze(allocation);
}
export function interleaveTaskSelections(selections: Readonly<Record<PteTaskType, readonly string[]>>): readonly string[] {
  const queue: string[] = [];
  const rounds = Math.max(...TASK_ORDER.map(task => selections[task].length));
  for (let round = 0; round < rounds; round++) for (const task of TASK_ORDER)
    if (round < selections[task].length) queue.push(selections[task][round]);
  return Object.freeze(queue);
}
