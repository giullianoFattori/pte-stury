import { prepareStudySession, type SessionPreparationDependencies } from './prepareStudySession.ts';
import { validateBuildRequest } from '../../domain/study-session/builder.ts';
import type { StudySessionsRepository } from '../../data/repositories/studySessionsRepository';
import { sessionFailure, sessionOperation } from '../../data/repositories/sessionStorage.ts';
export type SessionStartDependencies = SessionPreparationDependencies & { sessions: Pick<StudySessionsRepository, 'getActiveVersioned' | 'createActive'> };
export async function startStudySession(request: unknown, deps: SessionStartDependencies) {
  const validated = validateBuildRequest(request);
  return sessionOperation(async () => {
    if (await deps.sessions.getActiveVersioned()) sessionFailure('ACTIVE_SESSION_EXISTS', 'Resume or explicitly abandon the existing active session first.');
    const session = await prepareStudySession(validated.mode === 'quick' ? { mode: 'quick' } : validated, deps);
    return deps.sessions.createActive(session);
  });
}
