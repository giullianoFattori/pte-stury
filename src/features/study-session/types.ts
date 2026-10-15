import type { ExercisePersistenceError } from './services/persistExerciseOutcome';
import type { PteTaskType, StudyItem, StudySession } from '../../domain/pte/types';

export type ExerciseMode = Readonly<{ kind: 'standalone' }> | Readonly<{
  kind: 'session'; sessionId: string; expectedIndex: number; expectedItemId: string; isFinalItem: boolean;
}>;
export type ExerciseCompletion = Readonly<{
  attemptId: string; itemId: string; taskType: PteTaskType; score?: number; session?: StudySession;
}>;
export type ExerciseProps = Readonly<{
  item: StudyItem;
  mode?: ExerciseMode;
  onCompleted?: (completion: ExerciseCompletion) => void;
  onPersistenceError?: (error: ExercisePersistenceError) => void;
  /** Local standalone sequencing only; the session runner owns continuation. */
  onNext?: () => void;
  progress?: Readonly<{ currentIndex: number; total: number }>;
}>;
export const STANDALONE_EXERCISE_MODE: ExerciseMode = Object.freeze({ kind: 'standalone' });

export function exerciseIdentity({ item, mode }: ExerciseProps): string {
  return JSON.stringify([item.taskType, item.id, item.revision, mode?.kind ?? 'standalone',
    mode?.kind === 'session' ? [mode.sessionId, mode.expectedIndex, mode.expectedItemId, mode.isFinalItem] : null]);
}
