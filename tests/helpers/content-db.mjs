import 'fake-indexeddb/auto';
import { PteDatabase } from '../../src/data/db/database.ts';
import { readFile } from 'node:fs/promises';
import { canonicalBundle, jsonBytes } from '../../tools/content/canonicalize.mjs';
import { manifestFor } from '../../tools/content/manifest.mjs';

export const now = '2026-10-10T00:00:00.000Z';
export const ra = JSON.parse(await readFile(new URL('../fixtures/content/valid-ra.json', import.meta.url), 'utf8'));
export const rs = JSON.parse(await readFile(new URL('../fixtures/content/valid-rs.json', import.meta.url), 'utf8'));
export const wfd = JSON.parse(await readFile(new URL('../fixtures/content/valid-wfd.json', import.meta.url), 'utf8'));
export function catalog(items) { const bundle = canonicalBundle(items); return { bundle, manifest: manifestFor(bundle, jsonBytes(bundle)) }; }
export async function database(t) {
  const database = new PteDatabase('content-test-' + crypto.randomUUID());
  await database.open(); t.after(() => database.delete()); return database;
}
export const history = {
  attempts: [{ id: 'a-old', itemId: 'ra-001', taskType: 'read-aloud', createdAt: now, responseText: 'Historical response', score: 0.8 }],
  errors: [{ id: 'e-old', attemptId: 'a-old', itemId: 'ra-001', taskType: 'read-aloud', skills: ['speaking'], category: 'omission', severity: 1, createdAt: now }],
  reviews: [{ id: 'r-old', sourceAttemptId: 'a-old', sourceErrorId: 'e-old', itemId: 'ra-001', taskType: 'read-aloud', type: 'sentence', prompt: 'Historical prompt', answer: 'Historical answer', dueAt: now, intervalDays: 1, repetitions: 0, correctStreak: 0, createdAt: now }],
  studySessions: [{ id: 's-old', startedAt: now, taskTypes: ['read-aloud'], attemptIds: ['a-old'] }],
};
export async function seedHistory(db) { for (const [name, rows] of Object.entries(history)) await db.table(name).bulkAdd(structuredClone(rows)); }
export async function snapshot(db) {
  return Object.fromEntries(await Promise.all(db.tables.map(async table => [table.name, await table.toArray()])));
}
