import type { PteTaskType, Skill, StudyItem } from '../pte/types';

/** Version of the authored/built content shape, independent of Dexie and app versions. */
export const QUESTION_BANK_SCHEMA_VERSION = 1 as const;

export const CONTENT_STATUSES = Object.freeze(['draft', 'active', 'retired'] as const);
export type ContentStatus = typeof CONTENT_STATUSES[number];

export const CONTENT_SOURCES = Object.freeze(['internal', 'licensed', 'generated', 'imported'] as const);
export type ContentSource = typeof CONTENT_SOURCES[number];

/** Prefixes for implemented exercises only; registering content does not add an exercise. */
export const QUESTION_ID_PREFIXES = Object.freeze({
  'write-from-dictation': 'wfd',
  'repeat-sentence': 'rs',
  'read-aloud': 'ra',
} as const satisfies Record<PteTaskType, string>);

export const NEW_QUESTION_ID_DIGITS = 6 as const;

export type StudyItemMetadata = Readonly<{
  /** Positive integer, advanced for a semantic content change; never decreased. */
  revision: number;
  status: ContentStatus;
  /** Origin category, not proof of a redistribution license or review approval. */
  source: ContentSource;
  tags?: readonly string[];
  /** Optional/possibly empty on drafts; active/retired validation requires skills. */
  skills?: readonly Skill[];
  topic?: string;
  estimatedSeconds?: number;
}>;

/** Application-owned audio. Path and declared integrity need validation before use. */
export type AudioAsset = Readonly<{
  path: string;
  sha256?: string;
  /** Positive safe-integer milliseconds when present, enforced by the v1 parser. */
  durationMs?: number;
  mimeType?: string;
}>;

/**
 * Durable authoring contract. Deliberately separate from legacy persisted StudyItem:
 * no installation timestamp or audioUrl alias in authored content. JSON validation
 * and task-specific requirements are enforced by validation.ts, not this type.
 */
export type QuestionBankItem = Readonly<
  Pick<StudyItem, 'id' | 'taskType' | 'difficulty' | 'prompt' | 'answer' | 'transcript'>
  & StudyItemMetadata
  & {
    audio?: AudioAsset;
    chunks?: readonly string[];
    phraseGroups?: readonly string[];
    stressWords?: readonly string[];
  }
>;

/** SHA-256 of the deterministic UTF-8 bundle bytes, not a human release number. */
export type ContentVersion = `sha256:${string}`;

export type QuestionBankBundle = Readonly<{
  schemaVersion: typeof QUESTION_BANK_SCHEMA_VERSION;
  items: readonly QuestionBankItem[];
}>;

export type QuestionBankManifest = Readonly<{
  schemaVersion: typeof QUESTION_BANK_SCHEMA_VERSION;
  contentVersion: ContentVersion;
  /** All lifecycle states; normal practice will select active items only. */
  itemCount: number;
  countsByTaskType: Readonly<Record<PteTaskType, number>>;
  /** Number of distinct referenced local audio paths, not number of audio-backed rows. */
  audioAssetCount: number;
}>;
