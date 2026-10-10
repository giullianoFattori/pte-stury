import type { QuestionBankItem } from './types';

export type ContentIssueCode =
  | 'INVALID_ITEM' | 'INVALID_JSON' | 'JSON_TOO_LARGE' | 'JSON_TOO_DEEP' | 'DUPLICATE_JSON_KEY' | 'UNKNOWN_FIELD'
  | 'REQUIRED_FIELD' | 'INVALID_TASK_TYPE' | 'INVALID_ID'
  | 'ID_TASK_MISMATCH' | 'INVALID_DIFFICULTY' | 'INVALID_REVISION'
  | 'INVALID_STATUS' | 'INVALID_SOURCE' | 'INVALID_TEXT' | 'INVALID_ARRAY'
  | 'DUPLICATE_VALUE' | 'INVALID_SKILL' | 'INVALID_DURATION'
  | 'INVALID_AUDIO_OBJECT' | 'INVALID_AUDIO_PATH' | 'INVALID_AUDIO_SHA256'
  | 'INVALID_AUDIO_MIME' | 'ANSWER_TRANSCRIPT_MISMATCH' | 'INVALID_BATCH'
  | 'DUPLICATE_ID' | 'DUPLICATE_PROMPT' | 'DUPLICATE_ANSWER'
  | 'DUPLICATE_TRANSCRIPT' | 'DUPLICATE_AUDIO_PATH';
export type ContentValidationIssue = Readonly<{
  path: string;
  code: ContentIssueCode;
  message: string;
  itemId?: string;
}>;
export type ValidationResult<T> =
  | Readonly<{ success: true; data: T }>
  | Readonly<{ success: false; errors: readonly ContentValidationIssue[] }>;
export type ContentValidationReport = Readonly<{
  errors: readonly ContentValidationIssue[];
  warnings: readonly ContentValidationIssue[];
}>;
export type ContentBatchValidationResult = ContentValidationReport & (
  | Readonly<{ success: true; items: readonly QuestionBankItem[] }>
  | Readonly<{ success: false }>
);

export class ContentValidationError extends Error {
  readonly issues: readonly ContentValidationIssue[];
  readonly itemId?: string;
  constructor(issues: readonly ContentValidationIssue[], itemId?: string) {
    super(`Content validation failed (${issues.length} issue(s)).`);
    this.name = 'ContentValidationError';
    this.issues = Object.freeze(issues.map(issue => Object.freeze({ ...issue })));
    this.itemId = itemId;
  }
}
