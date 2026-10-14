import type { StudySession } from '../../domain/pte/types';
import { db, type PteDatabase } from '../db/database.ts';
import { parseStudySession, abandonStudySession, completeStudySession } from '../../domain/study-session/lifecycle.ts';
import { isPracticeEligible } from '../../domain/content/installedContent.ts';
import { activeVersioned, parseSavedSession, loadActiveSession, checkExpectedIndex, resolveSessionItem,
  sessionOperation, sessionFailure, verifySavedProgress, validateSessionItem } from './sessionStorage.ts';
export type SessionResumeResult = Readonly<{
  session: StudySession;
  isCatalogCurrent: boolean;
}> & (Readonly<{ kind: 'item'; item: Awaited<ReturnType<typeof resolveSessionItem>> }>
  | Readonly<{ kind: 'completion-pending' }>);
export function createStudySessionsRepository(database: PteDatabase = db) {
  return {
    async createActive(input: StudySession) {
      const session = parseStudySession(input);
      if (session.status !== 'active' || session.currentIndex !== 0)
        sessionFailure('INVALID_SESSION_STATE', 'Only a newly prepared active session can be created.');
      return sessionOperation(() => database.transaction('rw', database.studySessions, database.studyItems, database.contentState, async () => {
        if (await activeVersioned(database)) sessionFailure('ACTIVE_SESSION_EXISTS', 'Resume or explicitly abandon the existing active session first.');
        if (await database.studySessions.get(session.id)) sessionFailure('SESSION_PROGRESS_CONFLICT', 'Session identity already exists.');
        const state = await database.contentState.get('question-bank');
        if (!state) sessionFailure('SESSION_STORAGE_CORRUPT', 'No installed catalog identity is available.');
        if (session.contentVersion !== state.contentVersion) sessionFailure('SESSION_PROGRESS_CONFLICT', 'Catalog changed during preparation. Prepare a new queue.');
        const items = await database.studyItems.bulkGet([...session.itemIds]);
        items.forEach((item, index) => {
          if (!item || !isPracticeEligible(item) || session.config.difficulties && !session.config.difficulties.includes(item.difficulty))
            sessionFailure('SESSION_ITEM_UNAVAILABLE', 'Prepared question is no longer eligible. Prepare a new queue.');
          validateSessionItem(item, session.itemIds[index], session);
        });
        await database.studySessions.add(session);
        return session;
      }));
    },
    getById(id: string) {
      return sessionOperation(async () => { const row = await database.studySessions.get(id); return row === undefined ? undefined : parseSavedSession(row); });
    },
    getAll() { return sessionOperation(async () => (await database.studySessions.toArray()).map(parseSavedSession)); },
    getActiveVersioned() { return sessionOperation(() => activeVersioned(database)); },
    resumeActive(id: string): Promise<SessionResumeResult> {
      return sessionOperation(() => database.transaction('r', database.studySessions, database.studyItems, database.contentState, database.attempts, async () => {
        await activeVersioned(database); // Detect multiple active rows; never choose one silently.
        const session = await loadActiveSession(database, id); await verifySavedProgress(database, session);
        const state = await database.contentState.get('question-bank');
        const isCatalogCurrent = session.contentVersion !== undefined && session.contentVersion === state?.contentVersion;
        if (session.currentIndex === session.itemIds.length) return { kind: 'completion-pending' as const, session, isCatalogCurrent };
        return { kind: 'item' as const, session, item: await resolveSessionItem(database, session), isCatalogCurrent };
      }));
    },
    abandonActiveSession(id: string, expectedIndex: number, finishedAt: string) {
      return sessionOperation(() => database.transaction('rw', database.studySessions, async () => {
        const session = await loadActiveSession(database, id); checkExpectedIndex(session, expectedIndex);
        const ended = abandonStudySession(session, finishedAt); await database.studySessions.put(ended); return ended;
      }));
    },
    /** Recovery for older exhausted-active rows only, never skip unanswered positions. */
    completeActiveSession(id: string, expectedIndex: number, finishedAt: string) {
      return sessionOperation(() => database.transaction('rw', database.studySessions, database.attempts, async () => {
        const session = await loadActiveSession(database, id); checkExpectedIndex(session, expectedIndex); await verifySavedProgress(database, session);
        const ended = completeStudySession(session, finishedAt); await database.studySessions.put(ended); return ended;
      }));
    },
  };
}
export type StudySessionsRepository = ReturnType<typeof createStudySessionsRepository>;
export const studySessionsRepository = createStudySessionsRepository();
