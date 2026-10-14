export const STUDY_SESSION_ERROR_CODES = Object.freeze([
  'INVALID_SESSION_CONFIG', 'INVALID_SESSION_STATE', 'INSUFFICIENT_CONTENT',
  'SESSION_NOT_FOUND', 'SESSION_NOT_ACTIVE', 'SESSION_ITEM_UNAVAILABLE',
  'SESSION_PROGRESS_CONFLICT', 'SESSION_ALREADY_COMPLETED',
  'SESSION_ATTEMPT_MISMATCH', 'LEGACY_SESSION_NOT_RESUMABLE',
] as const);
export type StudySessionErrorCode = typeof STUDY_SESSION_ERROR_CODES[number];
export type StudySessionIssue = Readonly<{ path: string; code: StudySessionErrorCode; message: string }>;
export class StudySessionError extends Error {
  readonly code: StudySessionErrorCode;
  readonly issues: readonly StudySessionIssue[];
  constructor(issue: StudySessionIssue) {
    super(issue.message);
    this.name = 'StudySessionError';
    this.code = issue.code;
    this.issues = Object.freeze([Object.freeze({ ...issue })]);
  }
}
