import { studySessionsRepository } from '../../data/repositories/studySessionsRepository.ts';
import { attemptsRepository } from '../../data/repositories/attemptsRepository.ts';
import { buildSessionSummary } from '../../domain/study-session/summary.ts';
import { StudySessionError } from '../../domain/study-session/errors.ts';

const defaults = { sessions: studySessionsRepository, attempts: attemptsRepository };
export async function getSessionSummary(id: string, dependencies: {
  sessions: Pick<typeof studySessionsRepository, 'getById'>;
  attempts: Pick<typeof attemptsRepository, 'getByIds'>;
} = defaults) {
  try {
    const session = await dependencies.sessions.getById(id);
    if (!session) throw new StudySessionError({ path: 'session', code: 'SESSION_NOT_FOUND', message: 'This study session could not be found.' });
    return buildSessionSummary(session, await dependencies.attempts.getByIds(session.attemptIds));
  } catch (error) {
    if (error instanceof StudySessionError && ['SESSION_SUMMARY_INCOMPLETE', 'SESSION_SUMMARY_CORRUPT', 'SESSION_NOT_FOUND'].includes(error.code)) throw error;
    throw new StudySessionError({ path: 'summary', code: 'SESSION_SUMMARY_CORRUPT', message: 'Session results could not be loaded safely.' });
  }
}
