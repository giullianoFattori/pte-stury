import { studySessionsRepository, type StudySessionsRepository } from '../../../data/repositories/studySessionsRepository.ts';
import { abandonActiveSession } from '../../../application/study-session/abandonStudySession.ts';
import { isVersionedStudySession } from '../../../domain/study-session/types.ts';
import { StudySessionError } from '../../../domain/study-session/errors.ts';
import { loadStudySession } from './loadStudySession.ts';

/** Read fresh progress at confirmation time. Never retry a conflicting abandon. */
export async function endStudySession(id: string, now: () => string,
  sessions: StudySessionsRepository = studySessionsRepository) {
  const latest = await sessions.getById(id);
  if (!latest || !isVersionedStudySession(latest) || latest.status !== 'active')
    return { kind: 'changed' as const, view: await loadStudySession(id, sessions, now) };
  try {
    const session = await abandonActiveSession(id, latest.currentIndex, now(), sessions);
    return { kind: 'ended' as const, session };
  } catch (error) {
    if (error instanceof StudySessionError && ['SESSION_PROGRESS_CONFLICT', 'SESSION_NOT_ACTIVE', 'SESSION_ALREADY_COMPLETED'].includes(error.code))
      return { kind: 'changed' as const, view: await loadStudySession(id, sessions, now) };
    throw error;
  }
}
