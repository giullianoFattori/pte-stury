import type { StudyItem, Difficulty, Skill } from '../pte/types';
import type { StudyItemQuery, QueryIssue } from './queryTypes';
import { StudyItemQueryError } from './queryTypes.ts';
import { TASK_ORDER, compare } from './canonical.ts';
import { CONTENT_LIMITS, CONTENT_SKILLS, LEGACY_QUESTION_IDS, newQuestionIdPattern } from './validationPolicy.ts';
import { isPracticeEligible } from './installedContent.ts';

export const MAX_QUERY_LIMIT = 500;
const fields = ['taskTypes', 'difficulties', 'skills', 'tags', 'topic', 'excludeIds', 'matchSkills', 'matchTags', 'limit'];
const nonempty = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max * 2 && v.trim().length > 0 && [...v].length <= max;
function plain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && Reflect.ownKeys(value).every(key => typeof key === 'string' && Object.getOwnPropertyDescriptor(value, key)?.enumerable && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value'));
}
export function parseStudyItemQuery(input: unknown = {}): StudyItemQuery {
  if (!plain(input)) throw new StudyItemQueryError([{ path: '$', code: 'INVALID_QUERY', message: 'Query must be a plain data object.' }]);
  const data = input;
  const issues: QueryIssue[] = [];
  const bad = (path: string, code: string) => issues.push({ path, code, message: 'Invalid query field.' });
  for (const key of Object.keys(input)) if (!fields.includes(key)) bad(key, 'UNKNOWN_QUERY_FIELD');
  function list<T extends string | number>(key: string, max: number, accepts: (v: unknown) => v is T): readonly T[] | undefined {
    if (!Object.hasOwn(data, key)) return undefined;
    const value = data[key];
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max || Reflect.ownKeys(value).length !== value.length + 1
      || !Array.from({ length: value.length }, (_, i) => Object.getOwnPropertyDescriptor(value, String(i))).every(d => d && Object.hasOwn(d, 'value'))) { bad(key, 'INVALID_QUERY_ARRAY'); return undefined; }
    const result: T[] = [], seen = new Set<T>();
    value.forEach((entry, i) => {
      if (!accepts(entry)) bad(`${key}[${i}]`, 'INVALID_QUERY_VALUE');
      else if (seen.has(entry)) bad(`${key}[${i}]`, 'DUPLICATE_QUERY_VALUE');
      else { seen.add(entry); result.push(entry); }
    });
    return Object.freeze(result);
  }
  const taskTypes = list('taskTypes', TASK_ORDER.length, (v): v is typeof TASK_ORDER[number] => TASK_ORDER.some(task => task === v));
  const difficulties = list('difficulties', 5, (v): v is Difficulty => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5);
  const skills = list('skills', CONTENT_SKILLS.length, (v): v is Skill => CONTENT_SKILLS.some(skill => skill === v));
  const tags = list('tags', CONTENT_LIMITS.tags, (v): v is string => nonempty(v, CONTENT_LIMITS.tag));
  const excludeIds = list('excludeIds', CONTENT_LIMITS.batchItems, (v): v is string => nonempty(v, CONTENT_LIMITS.id)
    && TASK_ORDER.some(task => new RegExp(newQuestionIdPattern(task)).test(v) || LEGACY_QUESTION_IDS[task].some(id => id === v)));
  const topic = input.topic, limit = input.limit;
  if (Object.hasOwn(input, 'topic') && !nonempty(topic, CONTENT_LIMITS.topic)) bad('topic', 'INVALID_QUERY_TOPIC');
  if (Object.hasOwn(input, 'limit') && (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_QUERY_LIMIT)) bad('limit', 'INVALID_QUERY_LIMIT');
  for (const key of ['matchSkills', 'matchTags']) if (Object.hasOwn(input, key) && input[key] !== 'any' && input[key] !== 'all') bad(key, 'INVALID_QUERY_MATCH_MODE');
  if (issues.length) throw new StudyItemQueryError(issues);
  return Object.freeze({
    ...(taskTypes === undefined ? {} : { taskTypes }), ...(difficulties === undefined ? {} : { difficulties }),
    ...(skills === undefined ? {} : { skills }), ...(tags === undefined ? {} : { tags }), ...(excludeIds === undefined ? {} : { excludeIds }),
    ...(typeof topic === 'string' ? { topic } : {}), ...(typeof limit === 'number' ? { limit } : {}),
    matchSkills: input.matchSkills === 'all' ? 'all' : 'any', matchTags: input.matchTags === 'all' ? 'all' : 'any',
  });
}
export const comparePracticeItems = (a: StudyItem, b: StudyItem) => TASK_ORDER.indexOf(a.taskType) - TASK_ORDER.indexOf(b.taskType)
  || a.difficulty - b.difficulty || compare(a.id, b.id);
export function matchesNothing(query: StudyItemQuery): boolean {
  return [query.taskTypes, query.difficulties, query.skills, query.tags].some(values => values?.length === 0);
}
/** Compile once per query; no metadata inference or text normalization. */
export function practiceItemPredicate(query: StudyItemQuery): (item: StudyItem) => boolean {
  const excluded = new Set(query.excludeIds);
  const tasks = query.taskTypes && new Set(query.taskTypes), difficulties = query.difficulties && new Set(query.difficulties);
  const match = (authored: readonly string[] | undefined, requested: readonly string[] | undefined, mode: 'any' | 'all' = 'any') => {
    if (!requested) return true;
    if (!requested.length || !authored?.length) return false;
    return mode === 'all' ? requested.every(value => authored.includes(value)) : requested.some(value => authored.includes(value));
  };
  return item => isPracticeEligible(item) && !excluded.has(item.id)
    && (!tasks || tasks.has(item.taskType)) && (!difficulties || difficulties.has(item.difficulty))
    && match(item.skills, query.skills, query.matchSkills) && match(item.tags, query.tags, query.matchTags)
    && (query.topic === undefined || item.topic === query.topic);
}
