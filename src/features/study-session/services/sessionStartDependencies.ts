import { validateBuildRequest } from '../../../domain/study-session/builder.ts';
import { db } from '../../../data/db/database.ts';
import { studyItemsRepository } from '../../../data/repositories/studyItemsRepository.ts';
import { studySessionsRepository } from '../../../data/repositories/studySessionsRepository.ts';
import { startStudySession, type SessionStartDependencies } from '../../../application/study-session/startStudySession.ts';
import { findResumableStudySession } from '../../../application/study-session/resumeStudySession.ts';
import { StudySessionError } from '../../../domain/study-session/errors.ts';
import type { ContentVersion } from '../../../domain/content/types';

export type SessionStartProductionDependencies = Omit<SessionStartDependencies, 'contentVersion'> & {
  sessions: typeof studySessionsRepository;
  getContentVersion: () => Promise<ContentVersion | undefined>;
};
// Randomness, identity and clock remain at the outer application boundary.
export const sessionStartDependencies: SessionStartProductionDependencies = {
  sessions: studySessionsRepository, source: studyItemsRepository,
  getContentVersion: async () => (await db.contentState.get('question-bank'))?.contentVersion,
  idGenerator: () => crypto.randomUUID(), now: () => new Date().toISOString(), rng: () => Math.random(),
};
export async function startPracticeSession(request: unknown, deps: SessionStartProductionDependencies = sessionStartDependencies) {
  validateBuildRequest(request);
  const existing = await findResumableStudySession(deps.sessions);
  if (existing) return { kind: 'resume' as const, session: existing.session };
  const contentVersion = await deps.getContentVersion();
  if (!contentVersion) throw new StudySessionError({ path: 'contentVersion', code: 'SESSION_STORAGE_CORRUPT', message: 'Installed content is unavailable.' });
  try {
    const session = await startStudySession(request, { ...deps, contentVersion });
    return { kind: 'started' as const, session };
  } catch (error) {
    if (error instanceof StudySessionError && error.code === 'ACTIVE_SESSION_EXISTS') {
      const active = await findResumableStudySession(deps.sessions);
      if (active) return { kind: 'resume' as const, session: active.session };
    }
    throw error;
  }
}
