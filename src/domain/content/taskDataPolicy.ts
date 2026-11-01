import { AUDIO_PATH_PATTERN, AUDIO_MIME_PATTERN, SHA256_PATTERN } from './validationPolicy.ts';
import type { TaskDataTaskType } from '../pte/taskRegistry';
export type DataRule = { type: 'string'|'number'|'integer'|'boolean'|'array'|'object'; minLength?: number; maxLength?: number; pattern?: string; enum?: readonly string[]; minimum?: number; maximum?: number; minItems?: number; maxItems?: number; uniqueItems?: boolean; items?: DataRule; properties?: Record<string, DataRule>; required?: readonly string[]; additionalProperties?: false };
const text = (maxLength = 10000): DataRule => ({ type: 'string', minLength: 1, maxLength, pattern: '\\S' });
const segmentText: DataRule = { type: 'string', maxLength: 10000 };
const strings = (): DataRule => ({ type: 'array', minItems: 1, maxItems: 200, items: text(1000) });
const object = (properties: Record<string, DataRule>, required = Object.keys(properties)): DataRule => ({ type: 'object', properties, required, additionalProperties: false });
export const AUDIO_ASSET_RULE = object({ path: { type: 'string', maxLength: 512, pattern: AUDIO_PATH_PATTERN }, sha256: { type: 'string', pattern: SHA256_PATTERN }, durationMs: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER }, mimeType: { type: 'string', maxLength: 100, pattern: AUDIO_MIME_PATTERN } }, ['path']);
const SST_AUDIO_ASSET_RULE = object({ path: { type: 'string', maxLength: 512, pattern: AUDIO_PATH_PATTERN }, sha256: { type: 'string', pattern: SHA256_PATTERN }, durationMs: { type: 'integer', minimum: 60_000, maximum: 90_000 }, mimeType: { type: 'string', maxLength: 100, pattern: AUDIO_MIME_PATTERN } }, ['path']);
const HIW_AUDIO_ASSET_RULE = object({ path: { type: 'string', maxLength: 512, pattern: AUDIO_PATH_PATTERN }, sha256: { type: 'string', pattern: SHA256_PATTERN }, durationMs: { type: 'integer', minimum: 15_000, maximum: 50_000 }, mimeType: { type: 'string', maxLength: 100, pattern: AUDIO_MIME_PATTERN } }, ['path']);
const LFB_AUDIO_ASSET_RULE = object({ path: { type: 'string', maxLength: 512, pattern: AUDIO_PATH_PATTERN }, sha256: { type: 'string', pattern: SHA256_PATTERN }, durationMs: { type: 'integer', minimum: 30_000, maximum: 60_000 }, mimeType: { type: 'string', maxLength: 100, pattern: AUDIO_MIME_PATTERN } }, ['path']);
export const IMAGE_ASSET_RULE = object({ path: { type: 'string', maxLength: 512, pattern: '^/images/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+\\.(?:png|jpg|jpeg|webp)$(?![\\s\\S])' }, sha256: { type: 'string', pattern: SHA256_PATTERN }, bytes: { type: 'integer', minimum: 1, maximum: 20 * 1024 * 1024 }, mediaType: { type: 'string', enum: ['image/png','image/jpeg','image/webp'] }, width: { type: 'integer', minimum: 1, maximum: 16384 }, height: { type: 'integer', minimum: 1, maximum: 16384 } });
const identity: DataRule = { type: 'string', maxLength: 64, pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$(?![\\s\\S])' };
const tokenText: DataRule = { type: 'string', minLength: 1, maxLength: 1000, pattern: '^[^\\s\\x00-\\x1f]+$(?![\\s\\S])' };
const choiceOption = object({ id: identity, text: text(1000), correct: { type: 'boolean' } });
const choices: DataRule = { type: 'array', minItems: 2, maxItems: 20, items: choiceOption };
const listeningAudio = object({ path: { type: 'string', maxLength: 512, pattern: AUDIO_PATH_PATTERN }, sha256: { type: 'string', pattern: SHA256_PATTERN }, durationMs: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER }, mimeType: { type: 'string', maxLength: 100, pattern: AUDIO_MIME_PATTERN } }, ['path']);
export const TASK_DATA_RULES: Readonly<Record<TaskDataTaskType, DataRule>> = Object.freeze({
  'retell-lecture': object({ audio: AUDIO_ASSET_RULE, transcript: text(50000), keyPoints: strings(), keywords: strings(), image: IMAGE_ASSET_RULE, imageAlt: text(1000) }, ['audio','transcript','keyPoints']),
  'summarize-group-discussion': object({ audio: AUDIO_ASSET_RULE,
    speakers: { type: 'array', minItems: 3, maxItems: 3, items: object({ id: identity, label: text(200) }) },
    turns: { type: 'array', minItems: 3, maxItems: 500, items: object({ speakerId: identity, text: text() }) },
    keyPoints: strings(),
    speakerPoints: { type: 'array', minItems: 3, maxItems: 3, items: object({ speakerId: identity, points: strings() }) },
    relationships: strings() }, ['audio','speakers','turns','keyPoints']),
  'describe-image': object({ image: IMAGE_ASSET_RULE, imageAlt: text(2000), imageType: { type: 'string', enum: ['chart','graph','map','table','process','photo','diagram','mixed'] }, keyFeatures: strings(), keywords: strings() }, ['image','imageAlt','imageType','keyFeatures']),
  'summarize-written-text': object({ passage: text(50000), keyPoints: strings(), referenceSummary: text() }, ['passage','keyPoints']),
  'summarize-spoken-text': object({ audio: SST_AUDIO_ASSET_RULE, transcript: text(50000), keyPoints: strings(), referenceSummary: text() }, ['audio','transcript','keyPoints']),
  'highlight-incorrect-words': object({ audio: HIW_AUDIO_ASSET_RULE, spokenTranscript: text(50000), displayedTokens: { type: 'array', minItems: 1, maxItems: 2000, items: object({ id: identity, text: tokenText, incorrect: { type: 'boolean' }, spokenText: tokenText }, ['id','text','incorrect']) } }),
  'answer-short-question': object({ audio: listeningAudio, questionTranscript: text(5000), acceptedAnswers: strings(), image: IMAGE_ASSET_RULE, imageAlt: text(1000) }, ['audio','questionTranscript','acceptedAnswers']),
  'respond-to-a-situation': object({ audio: listeningAudio, promptText: text(5000), scenario: object({ role: text(500), audience: text(500), relationship: text(500), communicationGoal: text(1000), register: { type: 'string', enum: ['formal','neutral','informal'] } }), requiredPoints: strings(), usefulFunctions: strings() }, ['audio','promptText','scenario','requiredPoints']),
  'write-essay': object({ prompt: text(5000), positionType: { type: 'string', enum: ['agree-disagree','discuss-both','advantages-disadvantages','problem-solution','open-argument'] }, keyRequirements: strings(), referenceOutline: strings() }, ['prompt','positionType','keyRequirements']),
  'reading-fill-blanks-dropdown': object({ segments: { type: 'array', minItems: 2, maxItems: 201, items: segmentText }, blanks: { type: 'array', minItems: 1, maxItems: 200, items: object({ id: identity, answer: text(1000), options: { type: 'array', minItems: 2, maxItems: 20, uniqueItems: true, items: text(1000) } }) } }),
  'reading-multiple-choice-multiple': object({ passage: text(50000), question: text(5000), options: choices }),
  'reorder-paragraph': object({ blocks: { type: 'array', minItems: 2, maxItems: 20, items: object({ id: identity, text: text(5000) }) }, correctOrder: { type: 'array', minItems: 2, maxItems: 20, items: identity } }),
  'reading-fill-blanks-drag-drop': object({ segments: { type: 'array', minItems: 2, maxItems: 201, items: segmentText }, blanks: { type: 'array', minItems: 1, maxItems: 200, items: object({ id: identity, answer: text(1000) }) }, wordBank: { type: 'array', minItems: 1, maxItems: 400, uniqueItems: true, items: text(1000) } }),
  'reading-multiple-choice-single': object({ passage: text(50000), question: text(5000), options: choices }),
  'listening-multiple-choice-multiple': object({ audio: listeningAudio, transcript: text(50000), question: text(5000), options: choices }),
  'listening-fill-blanks-type-in': object({ audio: LFB_AUDIO_ASSET_RULE, transcriptSegments: { type: 'array', minItems: 2, maxItems: 201, items: segmentText }, blanks: { type: 'array', minItems: 1, maxItems: 200, items: object({ id: identity, answer: text(1000) }) } }),
  'highlight-correct-summary': object({ audio: listeningAudio, transcript: text(50000), options: choices }),
  'listening-multiple-choice-single': object({ audio: listeningAudio, transcript: text(50000), question: text(5000), options: choices }),
  'select-missing-word': object({ audio: listeningAudio, transcriptBeforeBeep: text(50000), missingText: text(1000), options: choices }),
});
