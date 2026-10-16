import { studySessionsRepository, type StudySessionsRepository } from '../../../data/repositories/studySessionsRepository.ts';
import { resumeStudySession } from '../../../application/study-session/resumeStudySession.ts';
import { isVersionedStudySession } from '../../../domain/study-session/types.ts';
import { StudySessionError } from '../../../domain/study-session/errors.ts';

function failure(code: 'SESSION_NOT_FOUND' | 'LEGACY_SESSION_NOT_RESUMABLE' | 'SESSION_NOT_ACTIVE'): never {
  throw new StudySessionError({ path: 'session', code, message: 'Session could not be resumed.' });
}
export async function loadStudySession(id: string, sessions: StudySessionsRepository = studySessionsRepository,
  now: () => string = () => new Date().toISOString()) {
  const stored = await sessions.getById(id);
  if (!stored) return failure('SESSION_NOT_FOUND');
  if (!isVersionedStudySession(stored)) return failure('LEGACY_SESSION_NOT_RESUMABLE');
  if (stored.status === 'completed') return { kind: 'completed' as const, session: stored };
  if (stored.status === 'abandoned') return { kind: 'abandoned' as const, session: stored };
  try {
    const resumed = await resumeStudySession(id, sessions);
    if (resumed.kind === 'completion-pending') {
      // Conservative recovery of the verified older exhausted-active representation.
      const session = await sessions.completeActiveSession(id, resumed.session.currentIndex, now());
      return { kind: 'completed' as const, session };
    }
    return resumed;
  } catch (error) {
    // Another tab may finish between the read and resume/recovery transaction.
    if (error instanceof StudySessionError && ['SESSION_NOT_ACTIVE', 'SESSION_PROGRESS_CONFLICT'].includes(error.code)) {
      const latest = await sessions.getById(id);
      if (latest && isVersionedStudySession(latest) && latest.status !== 'active') {
        return latest.status === 'completed' ? { kind: 'completed' as const, session: latest }
          : { kind: 'abandoned' as const, session: latest };
      }
    }
    throw error;
  }
}
export function sessionMessage(error: unknown): string {
  if (error instanceof StudySessionError) {
    switch (error.code) {
      case 'SESSION_NOT_FOUND': return 'This study session could not be found.';
      case 'SESSION_NOT_ACTIVE': return 'This session is no longer active.';
      case 'LEGACY_SESSION_NOT_RESUMABLE': return 'This historical session cannot be resumed.';
      case 'SESSION_ITEM_UNAVAILABLE': return 'This session’s current question is unavailable.';
      case 'INSUFFICIENT_CONTENT': return 'There are not enough questions available for this selection.';
      case 'MULTIPLE_ACTIVE_SESSIONS':
      case 'SESSION_STORAGE_CORRUPT': return 'This study session could not be loaded safely.';
    }
  }
  return 'The session could not be loaded. Please try again.';
}
