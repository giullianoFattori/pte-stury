import { startPracticeSession, sessionStartDependencies, type SessionStartProductionDependencies } from './sessionStartDependencies.ts';
export type QuickPracticeDependencies = SessionStartProductionDependencies;
export function startQuickPractice(deps: QuickPracticeDependencies = sessionStartDependencies) {
  return startPracticeSession({ mode: 'quick' }, deps);
}
