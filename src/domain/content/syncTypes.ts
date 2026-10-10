import type { InstalledStudyItem } from './installedContent';

export type ContentSyncIssue = Readonly<{ itemId?: string; code: string; message: string }>;
export type QuestionBankSyncPlan = Readonly<{
  inserts: readonly InstalledStudyItem[];
  updates: readonly InstalledStudyItem[];
  unavailable: readonly InstalledStudyItem[];
  restored: readonly InstalledStudyItem[];
  unchanged: readonly string[];
  errors: readonly ContentSyncIssue[];
}>;
export class ContentSyncError extends Error {
  readonly issues: readonly ContentSyncIssue[];
  constructor(issues: readonly ContentSyncIssue[]) {
    super('Question bank synchronization failed.'); this.name = 'ContentSyncError'; this.issues = issues;
  }
}
