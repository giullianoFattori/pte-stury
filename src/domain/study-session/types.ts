import type { Difficulty, PteTaskType } from '../pte/types';
import type { ContentVersion } from '../content/types';

export const STUDY_SESSION_MODES = Object.freeze(['quick', 'task', 'mixed'] as const);
export const STUDY_SESSION_STATUSES = Object.freeze(['active', 'completed', 'abandoned'] as const);
export type StudySessionMode = typeof STUDY_SESSION_MODES[number];
export type StudySessionStatus = typeof STUDY_SESSION_STATUSES[number];
export const MAX_SESSION_ITEMS = 500;
export type StudySessionConfig = Readonly<{
  itemCount: number;
  difficulties?: readonly Difficulty[];
  taskTypes?: readonly PteTaskType[];
}>;
export type StudySession = Readonly<{
  id: string;
  mode: StudySessionMode;
  status: StudySessionStatus;
  startedAt: string;
  finishedAt?: string;
  /** Catalog identity at creation; never replaced on resume. Absence means unknown. */
  contentVersion?: ContentVersion;
  /** Tasks used by builder queues, in canonical order; requested tasks live in config. */
  taskTypes: readonly PteTaskType[];
  itemIds: readonly string[];
  /** Next unanswered position; queue length means awaiting explicit completion. */
  currentIndex: number;
  /** One saved attempt per answered queue position, in queue order. */
  attemptIds: readonly string[];
  config: StudySessionConfig;
}>;
export type LegacyStudySession = Readonly<{
  id: string;
  startedAt: string;
  finishedAt?: string;
  taskTypes: readonly PteTaskType[];
  attemptIds: readonly string[];
  mode?: never;
  status?: never;
}>;
export type StoredStudySession = StudySession | LegacyStudySession;
export type CreateStudySessionInput = Omit<StudySession, 'status' | 'currentIndex' | 'attemptIds' | 'finishedAt'>;
export type SessionAttemptLink = Readonly<{
  id: string;
  itemId: string;
  taskType: PteTaskType;
  sessionId: string;
}>;
export function isVersionedStudySession(session: StoredStudySession): session is StudySession {
  return session.mode !== undefined;
}
