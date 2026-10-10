import bundle from '../../generated/question-bank.json' with { type: 'json' };
import manifest from '../../generated/question-bank.manifest.json' with { type: 'json' };
import type { QuestionBankBundle, QuestionBankManifest } from '../../domain/content/types';
import { QUESTION_BANK_SCHEMA_VERSION } from '../../domain/content/types.ts';
import { validateQuestionBankItems } from '../../domain/content/validation.ts';
import { TASK_ORDER } from '../../domain/content/canonical.ts';
import { ContentSyncError } from '../../domain/content/syncTypes.ts';

function invalid(): never { throw new ContentSyncError([{ code: 'INVALID_CATALOG', message: 'Application-owned content bundle and manifest do not agree.' }]); }
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
/** Sanity checks only: SHA-256 authenticity/integrity is verified at build/package time. */
export function verifyQuestionBankCatalog(inputBundle: unknown, inputManifest: unknown): { bundle: QuestionBankBundle; manifest: QuestionBankManifest } {
  if (!record(inputBundle) || !record(inputManifest)) invalid();
  if (Object.keys(inputBundle).sort().join(',') !== 'items,schemaVersion'
    || Object.keys(inputManifest).sort().join(',') !== 'audioAssetCount,contentVersion,countsByTaskType,itemCount,schemaVersion'
    || inputBundle.schemaVersion !== QUESTION_BANK_SCHEMA_VERSION || inputManifest.schemaVersion !== QUESTION_BANK_SCHEMA_VERSION
    || typeof inputManifest.contentVersion !== 'string' || inputManifest.contentVersion.length !== 71
    || !/^sha256:[0-9a-f]{64}$/.test(inputManifest.contentVersion)) invalid();
  const parsed = validateQuestionBankItems(inputBundle.items);
  if (!parsed.success || parsed.items.length === 0) invalid();
  const counts = inputManifest.countsByTaskType;
  if (!record(counts) || Object.keys(counts).sort().join(',') !== [...TASK_ORDER].sort().join(',')) invalid();
  const taskCounts = { 'write-from-dictation': 0, 'repeat-sentence': 0, 'read-aloud': 0 };
  const audio = new Set<string>();
  for (const item of parsed.items) { taskCounts[item.taskType]++; if (item.audio) audio.add(item.audio.path); }
  if (inputManifest.itemCount !== parsed.items.length || inputManifest.audioAssetCount !== audio.size
    || TASK_ORDER.some(task => counts[task] !== taskCounts[task])) invalid();
  return {
    bundle: { schemaVersion: QUESTION_BANK_SCHEMA_VERSION, items: parsed.items },
    manifest: { schemaVersion: QUESTION_BANK_SCHEMA_VERSION,
      contentVersion: `sha256:${inputManifest.contentVersion.slice(7)}`,
      itemCount: parsed.items.length, countsByTaskType: taskCounts, audioAssetCount: audio.size },
  };
}
export function generatedQuestionBank() { return verifyQuestionBankCatalog(bundle, manifest); }
