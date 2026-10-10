import type { StudyItem } from '../pte/types';
import type { ContentVersion, QuestionBankItem, ContentStatus, ContentSource } from './types.ts';
import { canonicalItem } from './canonical.ts';
import { LEGACY_QUESTION_IDS, AUDIO_PATH_PATTERN, CONTENT_FIELDS } from './validationPolicy.ts';
import { safeParseQuestionBankItem } from './validation.ts';

export type InstalledStudyItem = StudyItem & {
  revision: number;
  status: ContentStatus;
  source: ContentSource;
  catalogAvailable: boolean;
};
export type InstalledContentState = {
  key: 'question-bank'; schemaVersion: number; contentVersion: ContentVersion; installedAt: string;
};
export function authoredContent(item: StudyItem): Record<string, unknown> {
  // Only authored semantic fields; ignore every local installation/presentation field.
  return Object.fromEntries(CONTENT_FIELDS.filter(key => Object.hasOwn(item, key)).map(key => [key, item[key]]));
}
export function installItem(item: QuestionBankItem, createdAt: string): InstalledStudyItem {
  const { tags, skills, chunks, phraseGroups, stressWords, ...authored } = canonicalItem(item);
  return {
    ...authored, createdAt, catalogAvailable: true,
    ...(authored.audio ? { audioUrl: authored.audio.path } : {}),
    ...(tags ? { tags: [...tags] } : {}),
    ...(skills ? { skills: [...skills] } : {}),
    ...(chunks ? { chunks: [...chunks] } : {}),
    ...(phraseGroups ? { phraseGroups: [...phraseGroups] } : {}),
    ...(stressWords ? { stressWords: [...stressWords] } : {}),
  };
}
export function isPracticeEligible(item: StudyItem): boolean {
  if (item.revision !== undefined || item.status !== undefined || item.source !== undefined || item.catalogAvailable !== undefined) {
    return Number.isSafeInteger(item.revision) && (item.revision ?? 0) > 0 && item.source !== undefined
      && item.status === 'active' && item.catalogAvailable === true;
  }
  // Transitional compatibility only for the explicit 17 identities, never new drafts.
  return LEGACY_QUESTION_IDS[item.taskType]?.some(id => id === item.id) ?? false;
}
export function isValidPracticeItem(item: StudyItem): boolean {
  if (!isPracticeEligible(item)) return false;
  if (item.revision !== undefined) return safeParseQuestionBankItem(authoredContent(item)).success;
  // Readiness gate for the grandfathered live bank, not canonical validation.
  // Never assign synthetic lifecycle/revision/provenance to a legacy row.
  const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
  return text(item.prompt) && [1, 2, 3, 4, 5].includes(item.difficulty)
    && text(item.answer) && item.answer === item.transcript
    && (item.taskType === 'read-aloud' || typeof item.audioUrl === 'string' && new RegExp(AUDIO_PATH_PATTERN).test(item.audioUrl))
    && (item.taskType !== 'repeat-sentence' || !!item.chunks?.length && item.chunks.every(text));
}
