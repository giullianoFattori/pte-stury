import { Link } from 'react-router-dom';
import type { StudySession } from '../../../domain/pte/types';
import { sessionModeLabel } from '../services/sessionPresentation';
export function SessionTerminalState({ session, ended }: { session: StudySession; ended: boolean }) {
  return <section className="practice-card">
    <h2>{ended ? 'This study session has ended.' : `${sessionModeLabel(session)} complete`}</h2>
    <p role="status">{ended ? 'Saved answers are still in your history.' : `${session.attemptIds.length} questions completed`}</p>
    <Link className="study-exercise-link" to="/study">Back to Study</Link>
  </section>;
}
