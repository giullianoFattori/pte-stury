import type { ActiveStudySessionController } from './hooks/useActiveStudySession';
import { startQuickPractice } from './services/startQuickPractice';

export function QuickPracticeButton({ controller }: { controller: ActiveStudySessionController }) {
  const { active, checking, starting } = controller;
  return (
    <section className="quick-practice" aria-labelledby="quick-practice-title" aria-busy={checking || starting}>
      <h3 id="quick-practice-title">Quick Practice</h3>
      <p>{active ? 'Continue your saved practice.' : '5 questions · mixed tasks'}</p>
      {checking && <p role="status">Checking for a session…</p>}
      {active && <p role="status">Question {Math.min(active.currentIndex + 1, active.itemIds.length)} of {active.itemIds.length}</p>}
      <button type="button" disabled={checking || starting} onClick={() => void controller.start(() => startQuickPractice())}>
        {starting ? 'Starting…' : active ? 'Resume current session' : 'Start Quick Practice'}
      </button>
    </section>
  );
}
