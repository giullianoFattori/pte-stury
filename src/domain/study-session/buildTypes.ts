import type { Difficulty, PteTaskType, StudyItem } from '../pte/types';
import type { ContentVersion } from '../content/types';
import type { StudySessionMode } from './types';
export type StudySessionBuildRequest = Readonly<{
  mode: StudySessionMode;
  itemCount?: number;
  taskTypes?: readonly PteTaskType[];
  difficulties?: readonly Difficulty[];
}>;
export type ValidatedSessionBuildRequest = Readonly<{
  mode: StudySessionMode;
  itemCount: number;
  taskTypes: readonly PteTaskType[];
  difficulties?: readonly Difficulty[];
}>;
export type TaskCounts = Readonly<Record<PteTaskType, number>>;
export type ContentCapacityDetails = Readonly<{ requested: number; available: number; byTask: TaskCounts }>;
export type StudySessionBuildInput = Readonly<{
  request: StudySessionBuildRequest;
  candidates: readonly StudyItem[];
  sessionId: string;
  startedAt: string;
  contentVersion: ContentVersion;
  rng: () => number;
}>;
