export type PteTaskType =
  | 'write-from-dictation'
  | 'repeat-sentence'
  | 'read-aloud';

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
  | 'insertion'
  | 'substitution'
  | 'other';

export type StudyItem = {
  id: string;
  taskType: PteTaskType;
  difficulty: Difficulty;
  prompt: string;
  answer?: string;
  transcript?: string;
  audioUrl?: string;
  createdAt: string;
};

export type AttemptMetricValue = number | boolean;

export type Attempt = {
  id: string;
  itemId: string;
  taskType: PteTaskType;
  createdAt: string;
  responseText?: string;
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

export type StudySession = {
  id: string;
  startedAt: string;
  finishedAt?: string;
  taskTypes: PteTaskType[];
  attemptIds: string[];
};
