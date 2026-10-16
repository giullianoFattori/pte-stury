import { Link, useParams } from 'react-router-dom';
import { StudyItemExercise } from './components/StudyItemExercise';
import { SessionHeader } from './components/SessionHeader';
import { SessionNavigation } from './components/SessionNavigation';
import { EndSessionConfirmation } from './components/EndSessionConfirmation';
import { SessionTerminalState } from './components/SessionTerminalState';
import { useStudySessionRunner } from './hooks/useStudySessionRunner';

export function StudySessionPage() {
  const { sessionId } = useParams();
  return <SessionRunner key={sessionId} sessionId={sessionId ?? ''} />;
}
function SessionRunner({ sessionId }: { sessionId: string }) {
  const runner = useStudySessionRunner(sessionId);
  const { state, conflict, reload, onCompleted, onPersistenceError } = runner;
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
  const notice = runner.notice && <p className="session-notice" role="status">{runner.notice}</p>;
  if (result.kind !== 'item') return <>{notice}<SessionTerminalState session={session} ended={result.kind === 'abandoned'} /></>;
  return (
    <>
      {notice}
      <SessionHeader session={session} />
      <SessionNavigation onEnd={runner.requestEnd} />
      <StudyItemExercise item={result.item}
        mode={{ kind: 'session', sessionId: session.id, expectedIndex: session.currentIndex, expectedItemId: result.item.id,
          isFinalItem: session.currentIndex === session.itemIds.length - 1 }}
        onCompleted={onCompleted} onPersistenceError={onPersistenceError} />
      {saved && <div className="session-continuation"><button type="button" onClick={() => void reload()}>Continue</button></div>}
      {runner.confirmingEnd && <EndSessionConfirmation ending={runner.ending} error={runner.endError}
        onKeep={runner.keepStudying} onEnd={() => void runner.confirmEnd()} />}
    </>
  );
}
