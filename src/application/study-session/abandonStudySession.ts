import { studySessionsRepository, type StudySessionsRepository } from '../../data/repositories/studySessionsRepository.ts';
export function abandonActiveSession(id: string, expectedIndex: number, finishedAt: string, sessions: Pick<StudySessionsRepository, 'abandonActiveSession'> = studySessionsRepository) {
  return sessions.abandonActiveSession(id, expectedIndex, finishedAt);
}
