import type { Attempt, ErrorRecord, ReviewItem, StudySession } from '../../domain/pte/types';
import { validateAttemptResponseData } from '../../domain/pte/validateAttemptResponseData.ts';
import { db, type PteDatabase } from '../db/database.ts';
import { recordSessionAttempt, completeStudySession } from '../../domain/study-session/lifecycle.ts';
import { sessionOperation, sessionFailure, loadVersionedSession, checkExpectedIndex, resolveSessionItem, verifySavedProgress, activeVersioned } from './sessionStorage.ts';
export type SessionProgress = Readonly<{
  sessionId: string; expectedIndex: number; expectedItemId: string;
  /** Mandatory for the final item; supplied by outer clock, never generated here. */
  finishedAt?: string;
}>;
export type PersistStudyOutcomeInput = {
  attempt: Attempt; errors: ErrorRecord[]; reviews: ReviewItem[];
  sessionProgress?: SessionProgress;
};
export function createStudyOutcomeRepository(database: PteDatabase = db) {
  return {
    async createStudyOutcome({ attempt, errors, reviews, sessionProgress }: PersistStudyOutcomeInput) {
      validateAttemptResponseData(attempt);
      let savedSession: StudySession | undefined;
      await sessionOperation(() => database.transaction('rw',
        [database.attempts, database.errors, database.reviews, ...(sessionProgress ? [database.studySessions, database.studyItems] : [])], async () => {
        if (sessionProgress) {
          await activeVersioned(database);
          const session = await loadVersionedSession(database, sessionProgress.sessionId);
          checkExpectedIndex(session, sessionProgress.expectedIndex);
          if (session.status !== 'active') sessionFailure('SESSION_NOT_ACTIVE', 'Session is not active.');
          if (sessionProgress.expectedItemId !== session.itemIds[session.currentIndex]) sessionFailure('SESSION_PROGRESS_CONFLICT', 'Expected item no longer matches the current queue position.');
          const item = await resolveSessionItem(database, session); await verifySavedProgress(database, session);
          if (attempt.sessionId !== session.id || attempt.itemId !== item.id || attempt.taskType !== item.taskType)
            sessionFailure('SESSION_ATTEMPT_MISMATCH', 'Attempt must belong to the current session item and task.');
          if (await database.attempts.get(attempt.id)) sessionFailure('SESSION_PROGRESS_CONFLICT', 'Attempt identity is already saved.');
          const errorIds = new Set(errors.map(error => error.id));
          if (errors.some(error => error.attemptId !== attempt.id || error.itemId !== item.id || error.taskType !== item.taskType)
            || reviews.some(review => review.sourceAttemptId !== attempt.id || review.itemId !== item.id || review.taskType !== item.taskType || review.sourceErrorId !== undefined && !errorIds.has(review.sourceErrorId)))
            sessionFailure('SESSION_ATTEMPT_MISMATCH', 'Outcome records must belong to this attempt and queued item.');
          savedSession = recordSessionAttempt(session, { id: attempt.id, itemId: attempt.itemId, taskType: attempt.taskType, sessionId: attempt.sessionId }, sessionProgress.expectedIndex);
          if (savedSession.currentIndex === savedSession.itemIds.length) {
            if (sessionProgress.finishedAt === undefined) sessionFailure('INVALID_SESSION_CONFIG', 'Final completion requires an injected finish timestamp.');
            savedSession = completeStudySession(savedSession, sessionProgress.finishedAt);
          }
        } else if (attempt.sessionId !== undefined) sessionFailure('SESSION_ATTEMPT_MISMATCH', 'A linked attempt requires atomic session progress.');
        // Shared outcome write path for standalone WFD/RS/RA and session mode.
        await database.attempts.add(attempt);
        if (errors.length) await database.errors.bulkAdd(errors);
        if (reviews.length) await database.reviews.bulkAdd(reviews);
        if (savedSession) await database.studySessions.put(savedSession);
      }));
      return { attempt, errors, reviews, ...(savedSession ? { session: savedSession } : {}) };
    },
  };
}
export type StudyOutcomeRepository = ReturnType<typeof createStudyOutcomeRepository>;
export const studyOutcomeRepository = createStudyOutcomeRepository();
