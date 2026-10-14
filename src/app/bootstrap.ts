import bundle from '../generated/question-bank.json' with { type: 'json' };
import manifest from '../generated/question-bank.manifest.json' with { type: 'json' };
import { db, type PteDatabase } from '../data/db/database.ts';
import { initializeQuestionBank } from '../data/question-bank/syncQuestionBank.ts';

export function bootstrapApp(database: PteDatabase = db) {
  return initializeQuestionBank(bundle, manifest, database);
}
