import type { ContentCapacityDetails } from './buildTypes';
export const STUDY_SESSION_ERROR_CODES = Object.freeze([
  'INVALID_SESSION_CONFIG', 'INVALID_SESSION_STATE', 'INSUFFICIENT_CONTENT',
  'SESSION_BUILD_FAILED', 'SESSION_NOT_FOUND', 'SESSION_NOT_ACTIVE', 'SESSION_ITEM_UNAVAILABLE',
  'SESSION_PROGRESS_CONFLICT', 'SESSION_ALREADY_COMPLETED',
  'SESSION_ATTEMPT_MISMATCH', 'LEGACY_SESSION_NOT_RESUMABLE',
] as const);
export type StudySessionErrorCode = typeof STUDY_SESSION_ERROR_CODES[number];
export type StudySessionIssue = Readonly<{ path: string; code: StudySessionErrorCode; message: string }>;
export class StudySessionError extends Error {
  readonly code: StudySessionErrorCode;
  readonly issues: readonly StudySessionIssue[];
  readonly details?: ContentCapacityDetails;
  constructor(issue: StudySessionIssue, details?: ContentCapacityDetails) {
    super(issue.message);
    this.name = 'StudySessionError';
    this.code = issue.code;
    if (details) this.details = Object.freeze({ ...details, byTask: Object.freeze({ ...details.byTask }) });
    this.issues = Object.freeze([Object.freeze({ ...issue })]);
  }
}
