import type { PteTaskType, StudySession } from '../../../domain/pte/types';
export const SESSION_TASK_LABELS: Readonly<Record<PteTaskType, string>> = {
  'write-from-dictation': 'Write From Dictation', 'repeat-sentence': 'Repeat Sentence', 'read-aloud': 'Read Aloud',
};
export function sessionModeLabel(session: StudySession): string {
  return session.mode === 'quick' ? 'Quick Practice' : session.mode === 'task' ? 'Task Practice' : 'Mixed Practice';
}
export function sessionHeading(session: StudySession): string {
  const task = session.config.taskTypes?.[0];
  return session.mode === 'task' && task ? `${sessionModeLabel(session)} · ${SESSION_TASK_LABELS[task]}` : sessionModeLabel(session);
}
