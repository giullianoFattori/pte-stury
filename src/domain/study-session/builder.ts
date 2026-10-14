import type { StudyItem } from '../pte/types';
import { QUESTION_ID_PREFIXES } from '../content/types.ts';
import { TASK_ORDER } from '../content/canonical.ts';
import { comparePracticeItems, practiceItemPredicate, parseStudyItemQuery } from '../content/query.ts';
import { sampleStudyItems } from '../content/sampling.ts';
import { createStudySession } from './lifecycle.ts';
import { StudySessionError } from './errors.ts';
import { validateBuildRequest } from './buildRequest.ts';
import { allocateTaskCounts, emptyTaskCounts, interleaveTaskSelections } from './allocation.ts';
import type { StudySessionBuildInput } from './buildTypes';
import type { StudySession } from './types';
export { validateBuildRequest } from './buildRequest.ts';
export function buildStudySession(input: StudySessionBuildInput): StudySession {
  const request = validateBuildRequest(input.request);
  if (!Array.isArray(input.candidates)) throw new StudySessionError({ path: 'candidates', code: 'SESSION_BUILD_FAILED', message: 'Expected practice candidates from the content source.' });
  // Reuse the authoritative predicate, never invent lifecycle/availability rules.
  const matches = practiceItemPredicate({ taskTypes: request.taskTypes, difficulties: request.difficulties });
  const buckets: Record<typeof TASK_ORDER[number], StudyItem[]> = { 'write-from-dictation': [], 'repeat-sentence': [], 'read-aloud': [] };
  const seen = new Set<string>();
  const candidates: readonly StudyItem[] = input.candidates;
  for (const item of candidates) {
    if (!item || !matches(item)) continue;
    try {
      parseStudyItemQuery({ taskTypes: [item.taskType], difficulties: [item.difficulty], excludeIds: [item.id] });
      if (!item.id.startsWith(QUESTION_ID_PREFIXES[item.taskType] + '-')) throw new Error('Identity task mismatch');
    }
    catch { throw new StudySessionError({ path: 'candidates', code: 'SESSION_BUILD_FAILED', message: 'Content source returned malformed candidate metadata.' }); }
    if (seen.has(item.id)) throw new StudySessionError({ path: 'candidates', code: 'SESSION_BUILD_FAILED', message: 'Content source returned duplicate eligible identities.' });
    seen.add(item.id); buckets[item.taskType].push(item);
  }
  const capacity = emptyTaskCounts();
  for (const task of TASK_ORDER) { buckets[task].sort(comparePracticeItems); capacity[task] = buckets[task].length; }
  const allocation = allocateTaskCounts(request.itemCount, request.taskTypes, capacity);
  const selections: Record<typeof TASK_ORDER[number], readonly string[]> = { 'write-from-dictation': [], 'repeat-sentence': [], 'read-aloud': [] };
  try {
    for (const task of TASK_ORDER) selections[task] = sampleStudyItems(buckets[task], allocation[task], input.rng).map(item => item.id);
  } catch {
    throw new StudySessionError({ path: 'rng', code: 'SESSION_BUILD_FAILED', message: 'Injected sampling failed or returned an invalid random value.' });
  }
  const queue = interleaveTaskSelections(selections);
  const usedTasks = TASK_ORDER.filter(task => allocation[task] > 0);
  if (queue.length !== request.itemCount || new Set(queue).size !== queue.length
    || TASK_ORDER.some(task => selections[task].length !== allocation[task]))
    throw new StudySessionError({ path: 'itemIds', code: 'SESSION_BUILD_FAILED', message: 'Selected queue does not match its allocation.' });
  return createStudySession({ id: input.sessionId, mode: request.mode, startedAt: input.startedAt,
    contentVersion: input.contentVersion, taskTypes: usedTasks, itemIds: queue,
    config: { itemCount: request.itemCount, taskTypes: request.mode === 'quick' ? usedTasks : request.taskTypes,
      ...(request.difficulties ? { difficulties: request.difficulties } : {}) },
  });
}
