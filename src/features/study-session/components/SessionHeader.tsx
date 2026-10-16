import type { StudySession } from '../../../domain/pte/types';
import { sessionHeading } from '../services/sessionPresentation';
export function SessionHeader({ session }: { session: StudySession }) {
  return <header className="session-header"><h2>{sessionHeading(session)}</h2>
    <p role="status">Question {session.currentIndex + 1} of {session.itemIds.length}</p></header>;
}
