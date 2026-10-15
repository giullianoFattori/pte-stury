import { progressStudySession } from '../../../application/study-session/progressStudySession.ts';
import { studyOutcomeRepository, type StudyOutcomeRepository } from '../../../data/repositories/studyOutcomeRepository.ts';
import type { Attempt, ErrorRecord, ReviewItem, StudyItem } from '../../../domain/pte/types';
import { StudySessionError, type StudySessionErrorCode } from '../../../domain/study-session/errors.ts';
import type { ExerciseCompletion, ExerciseMode } from '../types';

export type ExerciseOutcome = Readonly<{ attempt: Attempt; errors: ErrorRecord[]; reviews: ReviewItem[] }>;
export class ExercisePersistenceError extends Error {
  readonly code: StudySessionErrorCode;
  constructor(code: StudySessionErrorCode) {
    super(code === 'SESSION_PROGRESS_CONFLICT'
      ? 'Session progress changed. Resume the session before saving again.'
      : 'Your attempt could not be saved. Please try again.');
    this.name = 'ExercisePersistenceError';
    this.code = code;
  }
}
export function exercisePersistenceError(error: unknown): ExercisePersistenceError {
  if (error instanceof ExercisePersistenceError) return error;
  return new ExercisePersistenceError(error instanceof StudySessionError ? error.code : 'SESSION_PERSISTENCE_FAILED');
}
export async function persistExerciseOutcome(
  { item, attempt, errors, reviews, mode, now }: ExerciseOutcome & {
    item: StudyItem; mode: ExerciseMode; now: () => string;
  },
  outcomes: Pick<StudyOutcomeRepository, 'createStudyOutcome'> = studyOutcomeRepository,
): Promise<ExerciseCompletion> {
  try {
    if (attempt.itemId !== item.id || attempt.taskType !== item.taskType)
      throw new ExercisePersistenceError('SESSION_ITEM_MISMATCH');
    if (mode.kind !== 'standalone' && mode.kind !== 'session')
      throw new ExercisePersistenceError('INVALID_SESSION_CONFIG');
    if (mode.kind === 'session' && (typeof mode.sessionId !== 'string' || !mode.sessionId.trim()
      || !Number.isSafeInteger(mode.expectedIndex) || mode.expectedIndex < 0
      || mode.expectedItemId !== item.id || typeof mode.isFinalItem !== 'boolean'))
      throw new ExercisePersistenceError('SESSION_ITEM_MISMATCH');
    if (mode.kind === 'standalone' && attempt.sessionId !== undefined)
      throw new ExercisePersistenceError('SESSION_ATTEMPT_MISMATCH');
    if (mode.kind === 'session' && attempt.sessionId !== undefined && attempt.sessionId !== mode.sessionId)
      throw new ExercisePersistenceError('SESSION_ATTEMPT_MISMATCH');
    const result = mode.kind === 'standalone'
      ? await outcomes.createStudyOutcome({ attempt, errors, reviews })
      : await progressStudySession({ attempt: { ...attempt, sessionId: mode.sessionId }, errors, reviews,
        sessionProgress: { sessionId: mode.sessionId, expectedIndex: mode.expectedIndex,
          expectedItemId: mode.expectedItemId, ...(mode.isFinalItem ? { finishedAt: now() } : {}) } }, outcomes);
    return Object.freeze({ attemptId: result.attempt.id, itemId: result.attempt.itemId,
      taskType: result.attempt.taskType, ...(result.attempt.score === undefined ? {} : { score: result.attempt.score }),
      ...(result.session ? { session: result.session } : {}) });
  } catch (error) { throw exercisePersistenceError(error); }
}
