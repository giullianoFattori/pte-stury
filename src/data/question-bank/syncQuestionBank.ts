import { db, type PteDatabase } from '../db/database.ts';
import type { QuestionBankSyncPlan } from '../../domain/content/syncTypes';
import { ContentSyncError } from '../../domain/content/syncTypes.ts';
import { planQuestionBankSync } from '../../domain/content/sync.ts';
import { isValidPracticeItem } from '../../domain/content/installedContent.ts';
import { verifyQuestionBankCatalog, generatedQuestionBank } from './generatedQuestionBank.ts';

export type ContentSyncResult = { status: 'installed'; plan: QuestionBankSyncPlan } | { status: 'unchanged' };
export async function syncQuestionBank(inputBundle: unknown, inputManifest: unknown, database: PteDatabase = db): Promise<ContentSyncResult> {
  const catalog = verifyQuestionBankCatalog(inputBundle, inputManifest);
  return database.transaction('rw', database.studyItems, database.contentState, async () => {
    const state = await database.contentState.get('question-bank');
    // No full scan or writes for the already-installed application-owned hash.
    if (state?.contentVersion === catalog.manifest.contentVersion && state.schemaVersion === catalog.manifest.schemaVersion) return { status: 'unchanged' };
    const installedAt = new Date().toISOString();
    const plan = planQuestionBankSync(await database.studyItems.toArray(), catalog.bundle.items, installedAt);
    if (plan.errors.length) throw new ContentSyncError(plan.errors);
    if (plan.inserts.length) await database.studyItems.bulkAdd([...plan.inserts]);
    const mutations = [...plan.updates, ...plan.unavailable, ...plan.restored];
    if (mutations.length) await database.studyItems.bulkPut(mutations);
    await database.contentState.put({ key: 'question-bank', schemaVersion: catalog.manifest.schemaVersion, contentVersion: catalog.manifest.contentVersion, installedAt });
    return { status: 'installed', plan };
  });
}
/** Future activation entrypoint. Deliberately not called by current legacy bootstrap. */
export async function initializeQuestionBank(inputBundle: unknown, inputManifest: unknown, database: PteDatabase = db) {
  try {
    const catalog = verifyQuestionBankCatalog(inputBundle, inputManifest);
    if (!catalog.bundle.items.some(item => item.status === 'active')) throw new ContentSyncError([{ code: 'NO_ACTIVE_CONTENT', message: 'Catalog has no active practice content.' }]);
    return await syncQuestionBank(catalog.bundle, catalog.manifest, database);
  }
  catch {
    let validBank;
    try { validBank = await database.studyItems.filter(isValidPracticeItem).first(); }
    catch { /* Storage failure also becomes a controlled initialization error. */ }
    if (validBank) return { status: 'preserved' as const, warning: { code: 'CONTENT_SYNC_FAILED', message: 'Content update failed; the previous practice bank remains available.' } };
    throw new ContentSyncError([{ code: 'CONTENT_INITIALIZATION_FAILED', message: 'No valid practice bank is available. Content initialization failed.' }]);
  }
}
export function syncGeneratedQuestionBank(database: PteDatabase = db) {
  const { bundle, manifest } = generatedQuestionBank();
  return syncQuestionBank(bundle, manifest, database);
}
