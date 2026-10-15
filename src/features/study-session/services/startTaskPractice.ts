import { StudySessionError } from '../../../domain/study-session/errors.ts';
import { startPracticeSession, sessionStartDependencies, type SessionStartProductionDependencies } from './sessionStartDependencies.ts';

/** Converts UI configuration only; validation/selection remain in the existing builder. */
export async function startTaskPractice(input: unknown, deps: SessionStartProductionDependencies = sessionStartDependencies) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['taskType', 'itemCount', 'difficulty'].includes(key)))
    throw new StudySessionError({ path: 'request', code: 'INVALID_SESSION_CONFIG', message: 'Choose one task and a valid question count.' });
  const config = Object.fromEntries(Object.entries(input));
  return startPracticeSession({ mode: 'task', taskTypes: [config.taskType], itemCount: config.itemCount,
    ...(config.difficulty === undefined ? {} : { difficulties: [config.difficulty] }) }, deps);
}
