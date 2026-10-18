import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import ts from 'typescript';
import {
  QUESTION_BANK_SCHEMA_VERSION, CONTENT_STATUSES, CONTENT_SOURCES,
  QUESTION_ID_PREFIXES, NEW_QUESTION_ID_DIGITS,
} from '../src/domain/content/types.ts';
import { readAloudQuestions } from './helpers/legacy-question-bank.mjs';
import { repeatSentenceQuestions } from './helpers/legacy-question-bank.mjs';
import { writeFromDictationQuestions } from './helpers/legacy-question-bank.mjs';

test('content v2 exposes immutable lifecycle/source/prefix vocabulary for existing tasks', () => {
  assert.equal(QUESTION_BANK_SCHEMA_VERSION, 2);
  assert.deepEqual(CONTENT_STATUSES, ['draft', 'active', 'retired']);
  assert.deepEqual(CONTENT_SOURCES, ['internal', 'licensed', 'generated', 'imported']);
  assert.deepEqual(QUESTION_ID_PREFIXES, {
    'write-from-dictation': 'wfd', 'repeat-sentence': 'rs', 'read-aloud': 'ra', 'retell-lecture': 'rtl', 'summarize-group-discussion': 'sgd', 'describe-image': 'di', 'summarize-written-text': 'swt', 'summarize-spoken-text': 'sst', 'highlight-incorrect-words': 'hiw',
  });
  assert.equal(NEW_QUESTION_ID_DIGITS, 6);
  for (const value of [CONTENT_STATUSES, CONTENT_SOURCES, QUESTION_ID_PREFIXES]) {
    assert.ok(Object.isFrozen(value));
  }
});

test('published legacy identities remain unchanged are recorded in the historical baseline', () => {
  const banks = [writeFromDictationQuestions, repeatSentenceQuestions, readAloudQuestions];
  assert.deepEqual(banks.map(items => items.map(item => item.id)), [
    ['wfd-001', 'wfd-002', 'wfd-003', 'wfd-004', 'wfd-005'],
    ['rs-001', 'rs-002', 'rs-003', 'rs-004', 'rs-005', 'rs-006'],
    ['ra-001', 'ra-002', 'ra-003', 'ra-004', 'ra-005', 'ra-006'],
  ]);
  for (const item of banks.flat()) {
    assert.ok(item.id.startsWith(QUESTION_ID_PREFIXES[item.taskType] + '-'));
    assert.equal('revision' in item, false);
    assert.equal('status' in item, false);
    assert.equal('source' in item, false);
  }
});

test('authoring types require version metadata and preserve legacy StudyItem/Attempt compatibility', () => {
  // Compile a virtual consumer rather than inspecting source strings. JSON runtime
  // validation is intentionally deferred; these assertions only test TS contracts.
  const file = resolve('tests/fixtures/content-contract.ts');
  const source = `
import type { QuestionBankItem, QuestionBankBundle, QuestionBankManifest, StudyItemMetadata, ContentVersion } from '../../src/domain/content/types.ts';
import type { StudyItem, Attempt, PteTaskType } from '../../src/domain/pte/types.ts';
const item: QuestionBankItem = {
  id: 'rs-000001', taskType: 'repeat-sentence', difficulty: 2, prompt: 'Listen and repeat.',
  answer: 'The lecture starts at nine.', transcript: 'The lecture starts at nine.',
  revision: 1, status: 'draft', source: 'generated', tags: ['academic'], skills: ['listening', 'speaking'],
  topic: 'schedule', estimatedSeconds: 10, audio: { path: '/audio/rs/rs-000001.mp3' }, chunks: ['The lecture', 'starts at nine'],
};
const bundle: QuestionBankBundle = { schemaVersion: 2, items: [item] };
const manifest: QuestionBankManifest = {
  schemaVersion: 2, contentVersion: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', itemCount: 1, audioAssetCount: 1,
  countsByTaskType: { 'write-from-dictation': 0, 'repeat-sentence': 1, 'read-aloud': 0, 'retell-lecture':0, 'summarize-group-discussion':0, 'describe-image':0, 'summarize-written-text':0, 'summarize-spoken-text':0, 'highlight-incorrect-words':0 },
};
const legacy: StudyItem = { id: 'rs-001', taskType: 'repeat-sentence', difficulty: 1, prompt: 'Listen.', audioUrl: '/audio/rs/rs-001.mp3', createdAt: '2026-10-02T00:00:00.000Z' };
const oldAttempt: Attempt = { id: 'attempt', itemId: legacy.id, taskType: legacy.taskType, createdAt: legacy.createdAt };
const versionedAttempt: Attempt = { ...oldAttempt, itemRevision: item.revision };
// @ts-expect-error authored metadata cannot be omitted
const missing: QuestionBankItem = { id: 'ra-000001', taskType: 'read-aloud', difficulty: 1, prompt: 'Read.' };
// @ts-expect-error lifecycle is not an arbitrary string
const badStatus: StudyItemMetadata = { revision: 1, status: 'published', source: 'internal' };
// @ts-expect-error provenance is not an arbitrary string
const badSource: StudyItemMetadata = { revision: 1, status: 'draft', source: 'commercial' };
// @ts-expect-error declaring the content contract does not register a new task
const newTask: PteTaskType = 'answer-short-question';
// @ts-expect-error schema version is literal 2
const badBundle: QuestionBankBundle = { schemaVersion: 1, items: [] };
// @ts-expect-error every implemented task needs a count, including zero
const partialCounts: QuestionBankManifest['countsByTaskType'] = { 'read-aloud': 1 };
// @ts-expect-error content identity uses the SHA-256 namespace
const releaseVersion: ContentVersion = 'v1';
// @ts-expect-error canonical authored item is immutable
item.status = 'active';
// @ts-expect-error metadata lists are immutable
item.tags?.push('other');
// @ts-expect-error legacy audio alias is not authored content
const alias: QuestionBankItem = { ...item, audioUrl: '/audio/rs/rs-001.mp3' };
// @ts-expect-error authored content excludes an installation timestamp
const timestamp: QuestionBankItem = { ...item, createdAt: 'today' };
// @ts-expect-error attempt revision is numeric when present
const badAttempt: Attempt = { ...oldAttempt, itemRevision: '1' };
const lecture: StudyItem<'retell-lecture'> = { ...legacy, taskType: 'retell-lecture', taskData: { audio: { path: '/audio/lecture.mp3' }, transcript: 'A lecture.', keyPoints: ['Main point'] } };
const written: QuestionBankItem<'summarize-written-text'> = { ...item, taskType: 'summarize-written-text', taskData: { passage: 'Source passage.', keyPoints: ['Main idea'] } };
// @ts-expect-error typed task payload is not interchangeable with an image payload
const wrongPayload: StudyItem<'describe-image'> = { ...legacy, taskType: 'describe-image', taskData: lecture.taskData };
// @ts-expect-error foundation tasks cannot acquire unrelated taskData
const foundationPayload: StudyItem<'read-aloud'> = { ...legacy, taskType: 'read-aloud', taskData: written.taskData };
// @ts-expect-error nested authored semantic arrays are immutable
written.taskData?.keyPoints.push('Extra');
`;
  const options = { noEmit: true, strict: true, skipLibCheck: true,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true, target: ts.ScriptTarget.ES2023 };
  const host = ts.createCompilerHost(options), originalRead = host.readFile.bind(host);
  host.readFile = path => path === file ? source : originalRead(path);
  const originalExists = host.fileExists.bind(host);
  host.fileExists = path => path === file || originalExists(path);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.deepEqual(diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), []);
});
