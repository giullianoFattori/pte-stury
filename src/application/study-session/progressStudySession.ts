import { studyOutcomeRepository, type StudyOutcomeRepository, type PersistStudyOutcomeInput, type SessionProgress } from '../../data/repositories/studyOutcomeRepository.ts';
export function progressStudySession(input: PersistStudyOutcomeInput & { sessionProgress: SessionProgress }, outcomes: Pick<StudyOutcomeRepository, 'createStudyOutcome'> = studyOutcomeRepository) {
  return outcomes.createStudyOutcome(input);
}
