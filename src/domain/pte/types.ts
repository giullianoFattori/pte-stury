import type { StudyItemDataMap } from './taskData';
import type { AudioAsset, ContentStatus, ContentSource } from '../content/types';

export type PteTaskType =
  | 'write-from-dictation'
  | 'repeat-sentence'
  | 'read-aloud'
  | 'retell-lecture'
  | 'summarize-group-discussion'
  | 'describe-image'
  | 'summarize-written-text'
  | 'summarize-spoken-text'
  | 'highlight-incorrect-words'
  | 'answer-short-question'
  | 'respond-to-a-situation'
  | 'write-essay'
  | 'reading-fill-blanks-dropdown'
  | 'reading-multiple-choice-multiple'
  | 'reorder-paragraph'
  | 'reading-fill-blanks-drag-drop'
  | 'reading-multiple-choice-single'
  | 'listening-multiple-choice-multiple'
  | 'listening-fill-blanks-type-in'
  | 'highlight-correct-summary'
  | 'listening-multiple-choice-single'
  | 'select-missing-word';

export type Skill =
  | 'listening'
  | 'reading'
  | 'speaking'
  | 'writing';

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export type ErrorCategory =
  | 'spelling'
  | 'grammar'
  | 'vocabulary'
  | 'pronunciation'
  | 'fluency'
  | 'listening-decoding'
  | 'working-memory'
  | 'word-order'
  | 'omission'
  | 'form'
  | 'insertion'
  | 'substitution'
  | 'other';

export type StudyItem<T extends PteTaskType = PteTaskType> = {
  id: string;
  taskType: T;
  taskData?: StudyItemDataMap[T];
  difficulty: Difficulty;
  prompt: string;
  answer?: string;
  transcript?: string;
  audioUrl?: string;
  chunks?: string[];
  phraseGroups?: string[];
  stressWords?: string[];
  createdAt: string;
  /** Absent on legacy rows: unknown, never inferred as revision 1. */
  revision?: number;
  status?: ContentStatus;
  source?: ContentSource;
  audio?: AudioAsset;
  tags?: string[];
  skills?: Skill[];
  topic?: string;
  estimatedSeconds?: number;
  /** Local catalog membership, separate from authored lifecycle. */
  catalogAvailable?: boolean;
};

export type AttemptMetricValue = number | boolean;
export type LegacyHiuAttemptResponseData = Readonly<{
  kind?: never;
  selectedTokenIds?: readonly string[];
  correctTokenIds?: readonly string[];
  falsePositiveTokenIds?: readonly string[];
  missedTokenIds?: readonly string[];
}>;
export type AttemptResponseData = LegacyHiuAttemptResponseData | Readonly<
  | { kind: 'token-selection'; selectedTokenIds: readonly string[] }
  | { kind: 'single-choice'; selectedOptionId?: string }
  | { kind: 'multiple-choice'; selectedOptionIds: readonly string[] }
  | { kind: 'blank-text'; answers: Readonly<Record<string, string>> }
  | { kind: 'blank-choice'; answers: Readonly<Record<string, string>> }
  | { kind: 'ordered-blocks'; blockIds: readonly string[] }
>;

export type Attempt = {
  id: string;
  itemId: string;
  /** Presented content revision; absent on legacy attempts means unknown. */
  itemRevision?: number;
  /** Absent for historical and standalone attempts; assigned by future session adapters. */
  sessionId?: string;
  taskType: PteTaskType;
  createdAt: string;
  responseText?: string;
  /** Structured response for selection, blank, and ordering tasks; absent on historical attempts. */
  responseData?: AttemptResponseData;
  durationMs?: number;
  score?: number;
  metrics?: Record<string, AttemptMetricValue>;
};

export type ErrorRecord = {
  id: string;
  attemptId: string;
  itemId: string;
  taskType: PteTaskType;
  skills: Skill[];
  category: ErrorCategory;
  token?: string;
  expected?: string;
  actual?: string;
  expectedIndex?: number;
  actualIndex?: number;
  explanation?: string;
  severity: 1 | 2 | 3;
  createdAt: string;
};

export type ReviewItem = {
  id: string;
  sourceAttemptId: string;
  sourceErrorId?: string;
  itemId: string;
  taskType: PteTaskType;
  type: 'word' | 'phrase' | 'sentence' | 'grammar' | 'pronunciation';
  prompt: string;
  answer: string;
  dueAt: string;
  intervalDays: number;
  repetitions: number;
  correctStreak: number;
  createdAt: string;
};

export type { StudySession, LegacyStudySession, StoredStudySession } from '../study-session/types';
