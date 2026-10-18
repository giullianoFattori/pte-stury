import type { AudioAsset, ImageAsset } from '../content/types';
import type { PteTaskType, StudyItem } from './types';
import type { Wave1TaskType } from './taskRegistry';
export type RetellLectureItemData = Readonly<{ audio: AudioAsset; transcript: string; keyPoints: readonly string[]; keywords?: readonly string[]; image?: ImageAsset }>;
export type GroupDiscussionSpeaker = Readonly<{ id: string; label: string }>;
export type GroupDiscussionTurn = Readonly<{ speakerId: string; text: string }>;
export type SummarizeGroupDiscussionItemData = Readonly<{ audio: AudioAsset; speakers: readonly GroupDiscussionSpeaker[]; turns: readonly GroupDiscussionTurn[]; keyPoints: readonly string[]; relationships?: readonly string[] }>;
export type DescribeImageItemData = Readonly<{ image: ImageAsset; imageAlt: string; imageType: 'chart'|'graph'|'map'|'table'|'process'|'photo'|'diagram'|'mixed'; keyFeatures: readonly string[]; keywords?: readonly string[] }>;
export type SummarizeWrittenTextItemData = Readonly<{ passage: string; keyPoints: readonly string[]; referenceSummary?: string }>;
export type SummarizeSpokenTextItemData = Readonly<{ audio: AudioAsset; transcript: string; keyPoints: readonly string[]; referenceSummary?: string }>;
export type HighlightWordToken = Readonly<{ id: string; text: string; incorrect: boolean; spokenText?: string }>;
export type HighlightIncorrectWordsItemData = Readonly<{ audio: AudioAsset; spokenTranscript: string; displayedTokens: readonly HighlightWordToken[] }>;
export type StudyItemDataMap = {
  'write-from-dictation': never; 'repeat-sentence': never; 'read-aloud': never;
  'retell-lecture': RetellLectureItemData;
  'summarize-group-discussion': SummarizeGroupDiscussionItemData;
  'describe-image': DescribeImageItemData;
  'summarize-written-text': SummarizeWrittenTextItemData;
  'summarize-spoken-text': SummarizeSpokenTextItemData;
  'highlight-incorrect-words': HighlightIncorrectWordsItemData;
};
export type Wave1TaskData = StudyItemDataMap[Wave1TaskType];
export type TaskDataItem<T extends Wave1TaskType> = StudyItem<T> & { taskData: StudyItemDataMap[T] };
/** For already validated/narrowed items; no metadata inference or content rewriting. */
export function getTaskData<T extends Wave1TaskType>(item: TaskDataItem<T>): StudyItemDataMap[T] { return item.taskData; }
export function contentAudio(item: { taskType: PteTaskType; audio?: AudioAsset; taskData?: Wave1TaskData }): AudioAsset | undefined {
  return item.taskData && 'audio' in item.taskData ? item.taskData.audio : item.audio;
}
