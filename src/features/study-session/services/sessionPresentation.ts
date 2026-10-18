import type { StudySession } from '../../../domain/pte/types';
export { TASK_LABELS as SESSION_TASK_LABELS } from '../../../domain/pte/taskRegistry.ts';
import { TASK_LABELS as SESSION_TASK_LABELS } from '../../../domain/pte/taskRegistry.ts';
export function sessionModeLabel(session: StudySession): string {
  return session.mode === 'quick' ? 'Quick Practice' : session.mode === 'task' ? 'Task Practice' : 'Mixed Practice';
}
export function sessionHeading(session: StudySession): string {
  const task = session.config.taskTypes?.[0];
  return session.mode === 'task' && task ? `${sessionModeLabel(session)} · ${SESSION_TASK_LABELS[task]}` : sessionModeLabel(session);
}
