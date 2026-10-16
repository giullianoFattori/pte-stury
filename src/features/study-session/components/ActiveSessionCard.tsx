import type { ActiveStudySessionController } from '../hooks/useActiveStudySession';
import { sessionHeading } from '../services/sessionPresentation';
export function ActiveSessionCard({ controller }: { controller: ActiveStudySessionController }) {
  const { active, known, checking, starting } = controller;
  if (!active) return null;
  return (
    <section className="active-session-card" aria-labelledby="active-session-title" aria-busy={checking || starting}>
      <h3 id="active-session-title">Session in progress</h3>
      <p>{sessionHeading(active)}</p>
      <p role="status">Question {Math.min(active.currentIndex + 1, active.itemIds.length)} of {active.itemIds.length}</p>
      <button type="button" disabled={!known || checking || starting}
        onClick={() => void controller.resume()}>Resume current session</button>
    </section>
  );
}
