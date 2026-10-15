import { Link, useParams } from 'react-router-dom';
import { StudyItemExercise } from './components/StudyItemExercise';
import { useStudySessionRunner } from './hooks/useStudySessionRunner';

export function StudySessionPage() {
  const { sessionId } = useParams();
  return <SessionRunner key={sessionId} sessionId={sessionId ?? ''} />;
}
function SessionRunner({ sessionId }: { sessionId: string }) {
  const { state, conflict, reload, onCompleted, onPersistenceError } = useStudySessionRunner(sessionId);
  if (conflict || state.kind === 'error') return (
    <section className="practice-card">
      <h2>Study session</h2>
      <p role="alert">{conflict ? 'This session changed in another tab.' : state.kind === 'error' ? state.message : ''}</p>
      <button type="button" onClick={() => void reload()}>Reload session</button>
      <p><Link to="/study">Back to Study</Link></p>
    </section>
  );
  if (state.kind === 'loading') return <section className="practice-card" aria-busy="true"><p role="status">Loading session…</p></section>;
  const { result, saved } = state;
  const { session } = result;
  if (result.kind === 'completed') return (
    <section className="practice-card">
      <h2>{session.mode === 'quick' ? 'Quick Practice complete' : session.mode === 'task' ? 'Task Practice complete' : 'Practice complete'}</h2>
      <p role="status">{session.attemptIds.length} questions completed</p>
      <Link className="study-exercise-link" to="/study">Back to Study</Link>
    </section>
  );
  return (
    <>
      <div className="session-navigation"><Link to="/study">Back to Study</Link><p>Session progress is saved after each answer.</p></div>
      <StudyItemExercise item={result.item}
        mode={{ kind: 'session', sessionId: session.id, expectedIndex: session.currentIndex, expectedItemId: result.item.id,
          isFinalItem: session.currentIndex === session.itemIds.length - 1 }}
        progress={{ currentIndex: session.currentIndex, total: session.itemIds.length }}
        onCompleted={onCompleted} onPersistenceError={onPersistenceError} />
      {saved && <div className="session-continuation"><button type="button" onClick={() => void reload()}>Continue</button></div>}
    </>
  );
}
