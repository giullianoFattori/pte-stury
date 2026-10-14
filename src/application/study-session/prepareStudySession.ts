import type { StudyItem } from '../../domain/pte/types';
import type { StudyItemQuery } from '../../domain/content/queryTypes';
import type { ContentVersion } from '../../domain/content/types';
import { buildStudySession, validateBuildRequest } from '../../domain/study-session/builder.ts';
import { StudySessionError } from '../../domain/study-session/errors.ts';
export type StudyItemSource = { queryPracticeItems(query: StudyItemQuery): Promise<readonly StudyItem[]> };
export type SessionPreparationDependencies = Readonly<{
  source: StudyItemSource;
  contentVersion: ContentVersion;
  idGenerator: () => string;
  now: () => string;
  rng: () => number;
}>;
/** Read-only application boundary. startStudySession adds 07.03 persistence and active-session policy. */
export async function prepareStudySession(request: unknown, deps: SessionPreparationDependencies) {
  const validated = validateBuildRequest(request);
  try {
    const candidates = await deps.source.queryPracticeItems({ taskTypes: validated.taskTypes,
      ...(validated.difficulties ? { difficulties: validated.difficulties } : {}) });
    return buildStudySession({ request: validated.mode === 'quick' ? { mode: 'quick' } : validated, candidates, sessionId: deps.idGenerator(), startedAt: deps.now(),
      contentVersion: deps.contentVersion, rng: deps.rng });
  } catch (error) {
    if (error instanceof StudySessionError) throw error;
    throw new StudySessionError({ path: 'build', code: 'SESSION_BUILD_FAILED', message: 'Session preparation failed. No session was saved.' });
  }
}
