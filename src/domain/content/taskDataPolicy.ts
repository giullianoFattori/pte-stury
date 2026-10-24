import { AUDIO_PATH_PATTERN, AUDIO_MIME_PATTERN, SHA256_PATTERN } from './validationPolicy.ts';
import type { Wave1TaskType } from '../pte/taskRegistry';
export type DataRule = { type: 'string'|'number'|'integer'|'boolean'|'array'|'object'; minLength?: number; maxLength?: number; pattern?: string; enum?: readonly string[]; minimum?: number; maximum?: number; minItems?: number; maxItems?: number; uniqueItems?: boolean; items?: DataRule; properties?: Record<string, DataRule>; required?: readonly string[]; additionalProperties?: false };
const text = (maxLength = 10000): DataRule => ({ type: 'string', minLength: 1, maxLength, pattern: '\\S' });
const strings = (): DataRule => ({ type: 'array', minItems: 1, maxItems: 200, items: text(1000) });
const object = (properties: Record<string, DataRule>, required = Object.keys(properties)): DataRule => ({ type: 'object', properties, required, additionalProperties: false });
export const AUDIO_ASSET_RULE = object({ path: { type: 'string', maxLength: 512, pattern: AUDIO_PATH_PATTERN }, sha256: { type: 'string', pattern: SHA256_PATTERN }, durationMs: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER }, mimeType: { type: 'string', maxLength: 100, pattern: AUDIO_MIME_PATTERN } }, ['path']);
const SST_AUDIO_ASSET_RULE = object({ path: { type: 'string', maxLength: 512, pattern: AUDIO_PATH_PATTERN }, sha256: { type: 'string', pattern: SHA256_PATTERN }, durationMs: { type: 'integer', minimum: 60_000, maximum: 90_000 }, mimeType: { type: 'string', maxLength: 100, pattern: AUDIO_MIME_PATTERN } }, ['path']);
export const IMAGE_ASSET_RULE = object({ path: { type: 'string', maxLength: 512, pattern: '^/images/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+\\.(?:png|jpg|jpeg|webp)$(?![\\s\\S])' }, sha256: { type: 'string', pattern: SHA256_PATTERN }, bytes: { type: 'integer', minimum: 1, maximum: 20 * 1024 * 1024 }, mediaType: { type: 'string', enum: ['image/png','image/jpeg','image/webp'] }, width: { type: 'integer', minimum: 1, maximum: 16384 }, height: { type: 'integer', minimum: 1, maximum: 16384 } });
const identity: DataRule = { type: 'string', maxLength: 64, pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$(?![\\s\\S])' };
const tokenText: DataRule = { type: 'string', minLength: 1, maxLength: 1000, pattern: '^[^\\s\\x00-\\x1f]+$(?![\\s\\S])' };
export const TASK_DATA_RULES: Readonly<Record<Wave1TaskType, DataRule>> = Object.freeze({
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
  'highlight-incorrect-words': object({ audio: AUDIO_ASSET_RULE, spokenTranscript: text(50000), displayedTokens: { type: 'array', minItems: 1, maxItems: 2000, items: object({ id: identity, text: tokenText, incorrect: { type: 'boolean' }, spokenText: tokenText }, ['id','text','incorrect']) } }),
});
