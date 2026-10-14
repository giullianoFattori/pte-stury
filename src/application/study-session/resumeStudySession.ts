import { studySessionsRepository, type StudySessionsRepository } from '../../data/repositories/studySessionsRepository.ts';
export function resumeStudySession(id: string, sessions: Pick<StudySessionsRepository, 'resumeActive'> = studySessionsRepository) {
  return sessions.resumeActive(id);
}
export async function findResumableStudySession(sessions: Pick<StudySessionsRepository, 'getActiveVersioned' | 'resumeActive'> = studySessionsRepository) {
  const active = await sessions.getActiveVersioned();
  return active ? sessions.resumeActive(active.id) : undefined;
}
