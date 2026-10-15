import { validateBuildRequest } from '../../../domain/study-session/builder.ts';
import { StudySessionError } from '../../../domain/study-session/errors.ts';
import { practiceItemPredicate } from '../../../domain/content/query.ts';
import { emptyTaskCounts } from '../../../domain/study-session/allocation.ts';
import { startPracticeSession, sessionStartDependencies, type SessionStartProductionDependencies } from './sessionStartDependencies.ts';

export async function startMixedPractice(input: unknown, deps: SessionStartProductionDependencies = sessionStartDependencies) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['taskTypes', 'itemCount', 'difficulty'].includes(key)))
    throw new StudySessionError({ path: 'request', code: 'INVALID_SESSION_CONFIG', message: 'Choose at least two tasks and a valid question count.' });
  const config = Object.fromEntries(Object.entries(input));
  const request = validateBuildRequest({ mode: 'mixed', taskTypes: config.taskTypes, itemCount: config.itemCount,
    ...(config.difficulty === undefined ? {} : { difficulties: [config.difficulty] }) });
  // Product gate only. Eligibility, allocation, sampling and persistence remain shared.
  return startPracticeSession(request, { ...deps, source: { async queryPracticeItems(query) {
    const candidates = await deps.source.queryPracticeItems(query);
    const eligible = candidates.filter(practiceItemPredicate(query));
    const byTask = emptyTaskCounts();
    for (const item of eligible) byTask[item.taskType]++;
    if (request.taskTypes.some(task => byTask[task] === 0))
      throw new StudySessionError({ path: 'taskTypes', code: 'INSUFFICIENT_CONTENT', message: 'Every selected task needs available questions. Deselect empty tasks or change difficulty.' },
        { requested: request.itemCount, available: eligible.length, byTask });
    return candidates;
  } } });
}
