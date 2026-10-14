import type { PteDatabase } from '../db/database';
import type { StudyItem, StoredStudySession, StudySession } from '../../domain/pte/types';
import { parseStoredStudySession } from '../../domain/study-session/lifecycle.ts';
import { isVersionedStudySession } from '../../domain/study-session/types.ts';
import { StudySessionError, type StudySessionErrorCode } from '../../domain/study-session/errors.ts';
import { authoredContent, isValidPracticeItem } from '../../domain/content/installedContent.ts';
import { safeParseQuestionBankItem } from '../../domain/content/validation.ts';
import { QUESTION_ID_PREFIXES } from '../../domain/content/types.ts';
export function sessionFailure(code: StudySessionErrorCode, message: string): never {
  throw new StudySessionError({ path: 'session', code, message });
}
export async function sessionOperation<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof StudySessionError) throw error;
    sessionFailure('SESSION_PERSISTENCE_FAILED', 'Session storage operation failed. No partial progress was saved.');
  }
}
export function parseSavedSession(row: unknown): StoredStudySession {
  try { return parseStoredStudySession(row); }
  catch { sessionFailure('SESSION_STORAGE_CORRUPT', 'Stored session state is malformed.'); }
}
export async function activeVersioned(database: PteDatabase): Promise<StudySession | undefined> {
  const sessions = (await database.studySessions.toArray()).map(parseSavedSession);
  const active = sessions.filter(isVersionedStudySession).filter(s => s.status === 'active');
  if (active.length > 1) sessionFailure('MULTIPLE_ACTIVE_SESSIONS', 'More than one active session exists; explicit recovery is required.');
  return active[0];
}
export async function loadVersionedSession(database: PteDatabase, id: string): Promise<StudySession> {
  const row = await database.studySessions.get(id);
  if (!row) sessionFailure('SESSION_NOT_FOUND', 'Session was not found.');
  const session = parseSavedSession(row);
  if (!isVersionedStudySession(session)) sessionFailure('LEGACY_SESSION_NOT_RESUMABLE', 'Historical sessions have no resumable queue.');
  return session;
}
export async function loadActiveSession(database: PteDatabase, id: string): Promise<StudySession> {
  const session = await loadVersionedSession(database, id);
  if (session.status !== 'active') sessionFailure('SESSION_NOT_ACTIVE', 'Session is not active.');
  return session;
}
export function checkExpectedIndex(session: StudySession, index: number) {
  if (!Number.isSafeInteger(index) || index !== session.currentIndex)
    sessionFailure('SESSION_PROGRESS_CONFLICT', 'Session progress changed. Reload the current state.');
}
/** Verify existing progress references before resume/finalization/advancement. */
export async function verifySavedProgress(database: PteDatabase, session: StudySession) {
  const attempts = await database.attempts.bulkGet([...session.attemptIds]);
  if (attempts.some((attempt, index) => !attempt || attempt.sessionId !== session.id || attempt.itemId !== session.itemIds[index]
    || !Object.hasOwn(QUESTION_ID_PREFIXES, attempt.taskType) || !attempt.itemId.startsWith(QUESTION_ID_PREFIXES[attempt.taskType] + '-')))
    sessionFailure('SESSION_STORAGE_CORRUPT', 'Saved session attempts do not match the frozen queue.');
}
export async function resolveSessionItem(database: PteDatabase, session: StudySession): Promise<StudyItem> {
  const id = session.itemIds[session.currentIndex];
  if (!id) sessionFailure('SESSION_ITEM_UNAVAILABLE', 'The queue is exhausted; finalize this session explicitly.');
  const item = await database.studyItems.get(id);
  if (!item) sessionFailure('SESSION_ITEM_UNAVAILABLE', 'Queued question is no longer available in local storage.');
  return validateSessionItem(item, id, session);
}
export function validateSessionItem(item: StudyItem, id: string, session: StudySession): StudyItem {
  if (item.id !== id || !session.taskTypes.includes(item.taskType)) sessionFailure('SESSION_ITEM_MISMATCH', 'Queued question identity or task does not match the session.');
  if (item.revision === undefined) {
    if (!isValidPracticeItem(item)) sessionFailure('SESSION_ITEM_UNAVAILABLE', 'Queued historical question is structurally unusable.');
    return item;
  }
  // Published structural requirements, regardless of current lifecycle/availability.
  const checked = safeParseQuestionBankItem({ ...authoredContent(item), status: 'retired' });
  if (!checked.success || !['active', 'retired'].includes(item.status ?? ''))
    sessionFailure('SESSION_ITEM_UNAVAILABLE', 'Queued question is structurally unusable.');
  if (checked.data.audio && item.audioUrl !== undefined && item.audioUrl !== checked.data.audio.path)
    sessionFailure('SESSION_ITEM_MISMATCH', 'Queued question has conflicting audio identity.');
  return { ...item, ...(checked.data.audio ? { audioUrl: checked.data.audio.path } : {}) };
}
