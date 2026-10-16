import type { ActiveStudySessionController } from './hooks/useActiveStudySession';
import { startQuickPractice } from './services/startQuickPractice';

export function QuickPracticeButton({ controller }: { controller: ActiveStudySessionController }) {
  const { active, known, checking, starting } = controller;
  return (
    <section className="quick-practice" aria-labelledby="quick-practice-title" aria-busy={checking || starting}>
      <h3 id="quick-practice-title">Quick Practice</h3>
      <p>5 questions · mixed tasks</p>
      <button type="button" disabled={!known || checking || starting || !!active} onClick={() => void controller.start(() => startQuickPractice())}>
        {starting ? 'Starting…' : 'Start Quick Practice'}
      </button>
    </section>
  );
}
