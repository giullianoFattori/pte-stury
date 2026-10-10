import type { StudyItem } from '../pte/types';
import type { QuestionBankItem } from './types';
import type { QuestionBankSyncPlan, ContentSyncIssue } from './syncTypes';
import type { InstalledStudyItem } from './installedContent';
import { authoredContent, installItem } from './installedContent.ts';
import { canonicalItem, compare } from './canonical.ts';
import { safeParseQuestionBankItem, validateQuestionBankItems } from './validation.ts';

export function planQuestionBankSync(current: readonly StudyItem[], incoming: readonly QuestionBankItem[], installedAt: string): QuestionBankSyncPlan {
  const inserts: InstalledStudyItem[] = [], updates: InstalledStudyItem[] = [], unavailable: InstalledStudyItem[] = [], restored: InstalledStudyItem[] = [], unchanged: string[] = [], errors: ContentSyncIssue[] = [];
  const validated = validateQuestionBankItems(incoming);
  if (!validated.success) return { inserts, updates, unavailable, restored, unchanged, errors: validated.errors };
  const byId = new Map<string, StudyItem>(), incomingIds = new Set(incoming.map(item => item.id));
  for (const item of current) {
    if (byId.has(item.id)) errors.push({ itemId: item.id, code: 'DUPLICATE_INSTALLED_ID', message: 'Installed identities must be unique.' });
    byId.set(item.id, item);
  }
  for (const item of [...validated.items].sort((a, b) => compare(a.id, b.id))) {
    const old = byId.get(item.id);
    if (!old) { inserts.push(installItem(item, installedAt)); continue; }
    if (old.taskType !== item.taskType) { errors.push({ itemId: item.id, code: 'TASK_IDENTITY_CONFLICT', message: 'An existing identity cannot change task type.' }); continue; }
    if (old.revision === undefined) {
      if (old.status !== undefined || old.source !== undefined || old.catalogAvailable !== undefined) errors.push({ itemId: item.id, code: 'INVALID_INSTALLED_CONTENT', message: 'Incomplete installed version metadata.' });
      else updates.push(installItem(item, old.createdAt));
      continue;
    }
    const parsed = safeParseQuestionBankItem(authoredContent(old));
    if (!parsed.success || typeof old.catalogAvailable !== 'boolean') { errors.push({ itemId: item.id, code: 'INVALID_INSTALLED_CONTENT', message: 'Installed versioned content is invalid.' }); continue; }
    if (item.revision < old.revision) { errors.push({ itemId: item.id, code: 'REVISION_ROLLBACK', message: 'Incoming revision cannot downgrade installed content.' }); continue; }
    if (item.revision > old.revision) { updates.push(installItem(item, old.createdAt)); continue; }
    if (JSON.stringify(canonicalItem(parsed.data)) !== JSON.stringify(canonicalItem(item))) {
      errors.push({ itemId: item.id, code: 'EQUAL_REVISION_CONFLICT', message: 'Authored content changed without a revision increase.' });
    } else if (!old.catalogAvailable) restored.push({ ...old, revision: parsed.data.revision, status: parsed.data.status, source: parsed.data.source, catalogAvailable: true });
    else unchanged.push(item.id);
  }
  for (const old of [...current].sort((a, b) => compare(a.id, b.id))) {
    // Only versioned catalog-owned rows are managed; legacy seed remains independent.
    if (!incomingIds.has(old.id) && old.revision !== undefined) {
      const parsed = safeParseQuestionBankItem(authoredContent(old));
      if (!parsed.success || typeof old.catalogAvailable !== 'boolean') errors.push({ itemId: old.id, code: 'INVALID_INSTALLED_CONTENT', message: 'Installed versioned content is invalid.' });
      else if (old.catalogAvailable) unavailable.push({ ...old, revision: parsed.data.revision, status: parsed.data.status, source: parsed.data.source, catalogAvailable: false });
      else unchanged.push(old.id);
    }
  }
  // A rejected plan exposes no actionable mutations.
  return errors.length ? { inserts: [], updates: [], unavailable: [], restored: [], unchanged: [], errors }
    : { inserts, updates, unavailable, restored, unchanged, errors };
}
