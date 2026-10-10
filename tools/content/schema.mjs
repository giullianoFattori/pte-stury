// Deterministic documentation artifact, not the production question-bank builder.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { CONTENT_STATUSES, CONTENT_SOURCES, QUESTION_ID_PREFIXES } from '../../src/domain/content/types.ts';
import { CONTENT_FIELDS, BASE_REQUIRED_FIELDS, CONTENT_LIMITS, CONTENT_SKILLS,
  LEGACY_QUESTION_IDS, PUBLISHED_REQUIRED_FIELDS, AUDIO_PATH_PATTERN,
  AUDIO_MIME_PATTERN, SHA256_PATTERN, newQuestionIdPattern } from '../../src/domain/content/validationPolicy.ts';
const text = maximum => ({ type: 'string', minLength: 1, maxLength: maximum, pattern: '\\S' });
const array = (maximum, entryMaximum, minimum, unique = false) => ({ type: 'array', minItems: minimum, maxItems: maximum,
  items: text(entryMaximum), ...(unique ? { uniqueItems: true } : {}) });
export function questionBankItemSchema() {
  const properties = {
    id: { ...text(CONTENT_LIMITS.id), anyOf: Object.keys(QUESTION_ID_PREFIXES).flatMap(task => [
      { pattern: newQuestionIdPattern(task) }, { enum: LEGACY_QUESTION_IDS[task] },
    ]) },
    taskType: { enum: Object.keys(QUESTION_ID_PREFIXES) }, difficulty: { type: 'integer', minimum: 1, maximum: 5 },
    prompt: text(CONTENT_LIMITS.text), answer: text(CONTENT_LIMITS.text), transcript: text(CONTENT_LIMITS.text),
    revision: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    status: { enum: CONTENT_STATUSES }, source: { enum: CONTENT_SOURCES },
    tags: array(CONTENT_LIMITS.tags, CONTENT_LIMITS.tag, 0, true),
    skills: { type: 'array', maxItems: CONTENT_SKILLS.length, uniqueItems: true, items: { enum: CONTENT_SKILLS } },
    topic: text(CONTENT_LIMITS.topic), estimatedSeconds: { type: 'number', exclusiveMinimum: 0, maximum: Number.MAX_VALUE },
    chunks: array(CONTENT_LIMITS.entries, CONTENT_LIMITS.entry, 1),
    phraseGroups: array(CONTENT_LIMITS.entries, CONTENT_LIMITS.entry, 1),
    stressWords: array(CONTENT_LIMITS.entries, CONTENT_LIMITS.entry, 1, true),
    audio: { type: 'object', additionalProperties: false, required: ['path'], properties: {
      path: { type: 'string', maxLength: CONTENT_LIMITS.audioPath, pattern: AUDIO_PATH_PATTERN },
      sha256: { type: 'string', pattern: SHA256_PATTERN },
      durationMs: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
      mimeType: { type: 'string', maxLength: CONTENT_LIMITS.mimeType, pattern: AUDIO_MIME_PATTERN },
    } },
  };
  if (Object.keys(properties).length !== CONTENT_FIELDS.length) throw new Error('Schema field registry drift');
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://pte-study.local/schemas/question-bank-item-v1.json',
    title: 'PTE Study question-bank item — schema v1',
    description: 'One authored item, not a bank bundle. Runtime validation is authoritative.',
    $comment: 'Standard JSON Schema cannot compare two property values. x-pte-semanticRules declares that additional runtime rule; editor validation alone cannot approve content.',
    'x-pte-schemaVersion': 1,
    'x-pte-semanticRules': [{ code: 'ANSWER_TRANSCRIPT_MISMATCH', path: 'answer',
      rule: 'When answer and transcript are both present, they must be exactly equal (including on drafts).' }],
    type: 'object', additionalProperties: false, required: BASE_REQUIRED_FIELDS, properties,
    allOf: [
      ...Object.keys(QUESTION_ID_PREFIXES).map(task => ({
        if: { properties: { taskType: { const: task } }, required: ['taskType'] },
        then: { properties: { id: { anyOf: [{ pattern: newQuestionIdPattern(task) }, { enum: LEGACY_QUESTION_IDS[task] }] } } },
      })),
      { if: { properties: { status: { enum: ['active', 'retired'] } }, required: ['status'] },
        then: { properties: { skills: { minItems: 1 } }, allOf: Object.keys(QUESTION_ID_PREFIXES).map(task => ({
          if: { properties: { taskType: { const: task } }, required: ['taskType'] },
          then: { required: PUBLISHED_REQUIRED_FIELDS[task] },
        })) } },
    ],
  };
}
export const schemaBytes = () => JSON.stringify(questionBankItemSchema(), null, 2) + '\n';
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).join(' ') !== '--write') throw new Error('Usage: node tools/content/schema.mjs --write');
  await writeFile('content/schemas/question-bank.schema.json', schemaBytes());
}
