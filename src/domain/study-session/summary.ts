import { KNOWN_TASK_ORDER, taskTypeForItemId, isKnownTaskType } from '../pte/taskRegistry.ts';
import type { PteTaskType } from '../pte/types';
import type { StudySessionMode } from './types';
import { parseStudySession } from './lifecycle.ts';
import { StudySessionError } from './errors.ts';
import type { FoundationTaskType } from '../pte/taskRegistry.ts';

// A rollout must register explicit metric handling before enabling practice. No RA fallback.
const SUMMARY_EXACT_KEYS = Object.freeze({ 'write-from-dictation': 'exactMatch', 'repeat-sentence': 'exactContentMatch', 'read-aloud': 'exactTextMatch' } as const);
export const SESSION_SUMMARY_TASKS = Object.freeze([...KNOWN_TASK_ORDER.filter(task => Object.hasOwn(SUMMARY_EXACT_KEYS, task)), 'retell-lecture', 'summarize-group-discussion', 'describe-image'] as const);
type FoundationSessionSummary = Readonly<{
  taskType: 'write-from-dictation' | 'repeat-sentence' | 'read-aloud';
  questionCount: number;
  correctWords: number;
  expectedWords: number;
  totalErrors: number;
  exactCount: number;
  /** Expected-word weighted accuracy/recall/coverage; never an overall score. */
  accuracyPercent: number;
  sequenceAccuracyPercent?: number;
  chunkRetentionPercent?: number;
  analyzedChunkResponses?: number;
  speechRatioPercent?: number;
  longPauseCount?: number;
  responseLatencyMs?: number;
  speechRateWpm?: number;
  speechRateResponses?: number;
}>;
export type RetellLectureSessionSummary = Readonly<{
  taskType: 'retell-lecture'; questionCount: number; averageKeyPointCoveragePercent: number;
  matchedKeyPoints: number; totalKeyPoints: number; averageSpeechRatioPercent: number;
  averageLongPauseCount: number; averageResponseLatencyMs: number; averageSpeechRateWpm?: number; speechRateResponses?: number;
}>;
export type SummarizeGroupDiscussionSessionSummary = Readonly<{
  taskType: 'summarize-group-discussion'; questionCount: number;
  averageKeyPointCoveragePercent: number; matchedKeyPoints: number; totalKeyPoints: number;
  averageSpeakerCoveragePercent: number; representedSpeakers: number; totalSpeakerSlots: number;
  averageRelationshipCoveragePercent?: number; matchedRelationships?: number; totalRelationships?: number;
  averageSpeechRatioPercent: number; averageLongPauseCount: number; averageResponseLatencyMs: number;
  averageSpeechRateWpm?: number; speechRateResponses?: number;
}>;
export type DescribeImageSessionSummary = Readonly<{taskType:'describe-image';questionCount:number;averageFeatureCoveragePercent:number;matchedFeatures:number;totalFeatures:number;averageSpeechRatioPercent:number;averageLongPauseCount:number;averageResponseLatencyMs:number;averageSpeechRateWpm?:number;speechRateResponses?:number}>;
export type TaskSessionSummary = FoundationSessionSummary | RetellLectureSessionSummary | SummarizeGroupDiscussionSessionSummary | DescribeImageSessionSummary;
export type SessionSummary = Readonly<{
  sessionId: string;
  mode: StudySessionMode;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  questionCount: number;
  completedCount: number;
  byTask: Readonly<Partial<Record<PteTaskType, TaskSessionSummary>>>;
}>;

function corrupt(path: string): never {
  throw new StudySessionError({ path, code: 'SESSION_SUMMARY_CORRUPT', message: 'Session results failed integrity validation.' });
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) corrupt(path);
  return value as Record<string, unknown>;
}
function metric(metrics: Record<string, unknown>, key: string, path: string, integer = false, max = Number.MAX_VALUE): number {
  const n = metrics[key];
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > max || (integer && !Number.isSafeInteger(n))) corrupt(`${path}.${key}`);
  return n;
}
function total(values: readonly number[], path: string): number {
  const n = values.reduce((a, b) => a + b, 0);
  if (!Number.isSafeInteger(n)) corrupt(path);
  return n;
}
function mean(values: readonly number[]): number {
  // Divide first to avoid overflowing a sum of otherwise valid finite measurements.
  const value = values.reduce((a, b) => a + b / values.length, 0);
  if (!Number.isFinite(value)) corrupt('metrics.average');
  return value;
}

/** Attempts must be supplied in the exact persisted ledger order, including missing slots. */
export function buildSessionSummary(input: unknown, rows: readonly unknown[]): SessionSummary {
  let session;
  try { session = parseStudySession(input); } catch { corrupt('session'); }
  if (session.status !== 'completed' || !session.finishedAt) corrupt('session.status');
  if (!Array.isArray(rows) || rows.length !== session.attemptIds.length) corrupt('attempts');
  const groups = new Map<PteTaskType, Record<string, unknown>[]>();
  Array.from(rows).forEach((row, index) => {
    if (row === undefined || row === null) throw new StudySessionError({ path: `attempts[${index}]`, code: 'SESSION_SUMMARY_INCOMPLETE', message: 'A referenced session result is missing.' });
    const path = `attempts[${index}]`, attempt = object(row, path);
    const task = attempt.taskType;
    if (!isKnownTaskType(task) || taskTypeForItemId(session.itemIds[index]) !== task || !session.taskTypes.includes(task) || !SESSION_SUMMARY_TASKS.includes(task as typeof SESSION_SUMMARY_TASKS[number])) corrupt(`${path}.taskType`);
    if (attempt.id !== session.attemptIds[index] || attempt.itemId !== session.itemIds[index] || !task || attempt.taskType !== task ||
        (attempt.sessionId !== undefined && attempt.sessionId !== session.id)) corrupt(path);
    const metrics = object(attempt.metrics, `${path}.metrics`);
    if (task === 'retell-lecture') {
      metric(metrics, 'keyPointCoverage', path, false, 1); metric(metrics, 'keyPointCoveragePercent', path, false, 100);
      const matched = metric(metrics, 'matchedKeyPoints', path, true), totalPoints = metric(metrics, 'totalKeyPoints', path, true);
      if (!totalPoints || matched > totalPoints || Math.abs((matched / totalPoints) - (metrics.keyPointCoverage as number)) > 1e-8) corrupt(`${path}.keyPointCoverage`);
      metric(metrics, 'speechRatioPercent', path, false, 100); metric(metrics, 'longPauseCount', path, true); metric(metrics, 'responseLatencyMs', path);
      if (metrics.speechRateWpm !== undefined) metric(metrics, 'speechRateWpm', path);
      groups.set(task, [...(groups.get(task) ?? []), metrics]); return;
    }
    if (task === 'summarize-group-discussion') {
      metric(metrics, 'keyPointCoverage', path, false, 1); metric(metrics, 'keyPointCoveragePercent', path, false, 100);
      const matched = metric(metrics, 'matchedKeyPoints', path, true), totalPoints = metric(metrics, 'totalKeyPoints', path, true);
      if (!totalPoints || matched > totalPoints || Math.abs((matched / totalPoints) - (metrics.keyPointCoverage as number)) > 1e-8) corrupt(`${path}.keyPointCoverage`);
      metric(metrics, 'speakerCoverage', path, false, 1); metric(metrics, 'speakerCoveragePercent', path, false, 100);
      const represented = metric(metrics, 'representedSpeakers', path, true), speakers = metric(metrics, 'totalSpeakers', path, true);
      if (speakers !== 3 || represented > speakers || Math.abs((represented / speakers) - (metrics.speakerCoverage as number)) > 1e-8) corrupt(`${path}.speakerCoverage`);
      const relationshipKeys = ['relationshipCoverage','relationshipCoveragePercent','matchedRelationships','totalRelationships'];
      const relationshipValues = relationshipKeys.filter(key => metrics[key] !== undefined);
      if (relationshipValues.length && relationshipValues.length !== relationshipKeys.length) corrupt(`${path}.relationshipCoverage`);
      if (relationshipValues.length) {
        metric(metrics, 'relationshipCoverage', path, false, 1); metric(metrics, 'relationshipCoveragePercent', path, false, 100);
        const matchedRelationships = metric(metrics, 'matchedRelationships', path, true), totalRelationships = metric(metrics, 'totalRelationships', path, true);
        if (!totalRelationships || matchedRelationships > totalRelationships || Math.abs((matchedRelationships / totalRelationships) - (metrics.relationshipCoverage as number)) > 1e-8) corrupt(`${path}.relationshipCoverage`);
      }
      metric(metrics, 'speechRatioPercent', path, false, 100); metric(metrics, 'longPauseCount', path, true); metric(metrics, 'responseLatencyMs', path);
      if (metrics.speechRateWpm !== undefined) metric(metrics, 'speechRateWpm', path);
      if (metrics.processedLocally !== true) corrupt(`${path}.processedLocally`);
      groups.set(task, [...(groups.get(task) ?? []), metrics]); return;
    }
    if (task === 'describe-image') {
      metric(metrics,'featureCoverage',path,false,1);metric(metrics,'featureCoveragePercent',path,false,100);
      const matched=metric(metrics,'matchedFeatures',path,true),totalFeatures=metric(metrics,'totalFeatures',path,true);
      if(!totalFeatures||matched>totalFeatures||Math.abs(matched/totalFeatures-(metrics.featureCoverage as number))>1e-8)corrupt(`${path}.featureCoverage`);
      metric(metrics,'speechRatioPercent',path,false,100);metric(metrics,'longPauseCount',path,true);metric(metrics,'responseLatencyMs',path);
      if(metrics.speechRateWpm!==undefined)metric(metrics,'speechRateWpm',path);
      if(metrics.processedLocally!==true)corrupt(`${path}.processedLocally`);
      groups.set(task,[...(groups.get(task)??[]),metrics]);return;
    }
    if (!Object.hasOwn(SUMMARY_EXACT_KEYS, task)) corrupt(`${path}.taskType`);
    const foundationTask = task as FoundationTaskType;
    const correct = metric(metrics, 'correctWords', path, true), expected = metric(metrics, 'expectedWords', path, true);
    if (expected === 0 || correct > expected) corrupt(`${path}.expectedWords`);
    metric(metrics, 'totalErrors', path, true);
    const exact = SUMMARY_EXACT_KEYS[foundationTask];
    if (typeof metrics[exact] !== 'boolean') corrupt(`${path}.${exact}`);
    if (task === 'repeat-sentence') {
      metric(metrics, 'sequenceAccuracyPercent', path, false, 100);
      if (metrics.totalChunks !== undefined || metrics.retainedChunks !== undefined) {
        const chunks = metric(metrics, 'totalChunks', path, true), retained = metric(metrics, 'retainedChunks', path, true);
        if (retained > chunks) corrupt(`${path}.retainedChunks`);
      }
    }
    if (task === 'read-aloud') {
      metric(metrics, 'textCoveragePercent', path, false, 100);
      metric(metrics, 'speechRatioPercent', path, false, 100);
      metric(metrics, 'longPauseCount', path, true);
      metric(metrics, 'responseLatencyMs', path);
      if (metrics.speechRateWpm !== undefined) metric(metrics, 'speechRateWpm', path);
    }
    groups.set(foundationTask, [...(groups.get(foundationTask) ?? []), metrics]);
  });
  const byTask: Partial<Record<PteTaskType, TaskSessionSummary>> = {};
  for (const task of KNOWN_TASK_ORDER) {
    const group = groups.get(task); if (!group) continue;
    // All fields below were individually validated above. No optional measurement becomes zero.
    const numbers = (key: string) => group.map(m => m[key] as number);
    if (task === 'retell-lecture') {
      const matchedKeyPoints = total(numbers('matchedKeyPoints'), task), totalKeyPoints = total(numbers('totalKeyPoints'), task);
      const rates = group.filter(m => m.speechRateWpm !== undefined).map(m => m.speechRateWpm as number);
      byTask[task] = Object.freeze({ taskType: task, questionCount: group.length,
        averageKeyPointCoveragePercent: mean(numbers('keyPointCoveragePercent')), matchedKeyPoints, totalKeyPoints,
        averageSpeechRatioPercent: mean(numbers('speechRatioPercent')), averageLongPauseCount: mean(numbers('longPauseCount')),
        averageResponseLatencyMs: mean(numbers('responseLatencyMs')),
        ...(rates.length ? { averageSpeechRateWpm: mean(rates), speechRateResponses: rates.length } : {}) });
      continue;
    }
    if (task === 'summarize-group-discussion') {
      const matchedKeyPoints = total(numbers('matchedKeyPoints'), task), totalKeyPoints = total(numbers('totalKeyPoints'), task);
      const representedSpeakers = total(numbers('representedSpeakers'), task), totalSpeakerSlots = total(numbers('totalSpeakers'), task);
      const relationshipGroup = group.filter(m => m.totalRelationships !== undefined);
      const rates = group.filter(m => m.speechRateWpm !== undefined).map(m => m.speechRateWpm as number);
      byTask[task] = Object.freeze({ taskType: task, questionCount: group.length,
        averageKeyPointCoveragePercent: mean(numbers('keyPointCoveragePercent')), matchedKeyPoints, totalKeyPoints,
        averageSpeakerCoveragePercent: mean(numbers('speakerCoveragePercent')), representedSpeakers, totalSpeakerSlots,
        ...(relationshipGroup.length ? { averageRelationshipCoveragePercent: mean(relationshipGroup.map(m => m.relationshipCoveragePercent as number)),
          matchedRelationships: total(relationshipGroup.map(m => m.matchedRelationships as number), task), totalRelationships: total(relationshipGroup.map(m => m.totalRelationships as number), task) } : {}),
        averageSpeechRatioPercent: mean(numbers('speechRatioPercent')), averageLongPauseCount: mean(numbers('longPauseCount')),
        averageResponseLatencyMs: mean(numbers('responseLatencyMs')),
        ...(rates.length ? { averageSpeechRateWpm: mean(rates), speechRateResponses: rates.length } : {}) });
      continue;
    }
    if(task==='describe-image'){
      const matchedFeatures=total(numbers('matchedFeatures'),task),totalFeatures=total(numbers('totalFeatures'),task),rates=group.filter(m=>m.speechRateWpm!==undefined).map(m=>m.speechRateWpm as number);
      byTask[task]=Object.freeze({taskType:task,questionCount:group.length,averageFeatureCoveragePercent:mean(numbers('featureCoveragePercent')),matchedFeatures,totalFeatures,averageSpeechRatioPercent:mean(numbers('speechRatioPercent')),averageLongPauseCount:mean(numbers('longPauseCount')),averageResponseLatencyMs:mean(numbers('responseLatencyMs')),...(rates.length?{averageSpeechRateWpm:mean(rates),speechRateResponses:rates.length}:{})});continue;
    }
    const correctWords = total(numbers('correctWords'), task), expectedWords = total(numbers('expectedWords'), task);
    const foundationTask = task as FoundationTaskType;
    const exactKey = SUMMARY_EXACT_KEYS[foundationTask];
    const extra: Record<string, number> = {};
    if (task === 'repeat-sentence') {
      extra.sequenceAccuracyPercent = group.reduce((sum, m) => sum + (m.sequenceAccuracyPercent as number) * ((m.expectedWords as number) / expectedWords), 0);
      const analyzed = group.filter(m => typeof m.totalChunks === 'number' && m.totalChunks > 0);
      if (analyzed.length) {
        extra.chunkRetentionPercent = 100 * total(analyzed.map(m => m.retainedChunks as number), task) / total(analyzed.map(m => m.totalChunks as number), task);
        extra.analyzedChunkResponses = analyzed.length;
      }
    }
    if (task === 'read-aloud') {
      extra.speechRatioPercent = mean(numbers('speechRatioPercent'));
      extra.longPauseCount = mean(numbers('longPauseCount'));
      extra.responseLatencyMs = mean(numbers('responseLatencyMs'));
      const rates = group.filter(m => m.speechRateWpm !== undefined).map(m => m.speechRateWpm as number);
      if (rates.length) { extra.speechRateWpm = mean(rates); extra.speechRateResponses = rates.length; }
    }
    byTask[foundationTask] = Object.freeze({ taskType: foundationTask, questionCount: group.length, correctWords, expectedWords,
      totalErrors: total(numbers('totalErrors'), task), exactCount: group.filter(m => m[exactKey] === true).length,
      accuracyPercent: correctWords / expectedWords * 100, ...extra });
  }
  return Object.freeze({ sessionId: session.id, mode: session.mode, startedAt: session.startedAt, finishedAt: session.finishedAt,
    durationMs: Date.parse(session.finishedAt) - Date.parse(session.startedAt), questionCount: session.itemIds.length,
    completedCount: rows.length, byTask: Object.freeze(byTask) });
}

export function formatSessionDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) corrupt('durationMs');
  const seconds = Math.floor(durationMs / 1000), minutes = Math.floor(seconds / 60), hours = Math.floor(minutes / 60);
  return hours ? `${hours} hr ${minutes % 60} min` : minutes ? `${minutes} min ${seconds % 60} sec` : `${seconds} sec`;
}
