import { Link } from 'react-router-dom';
export function SessionNavigation({ onEnd }: { onEnd: () => void }) {
  return <nav className="session-navigation" aria-label="Session navigation">
    <Link to="/study">Back to Study</Link>
    <button type="button" onClick={onEnd}>End session</button>
    <p>Unfinished sessions stay resumable when you leave. Unsaved answers and recordings are discarded.</p>
  </nav>;
}
