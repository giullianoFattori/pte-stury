import { useEffect, useState } from 'react';
import { getSessionSummary } from '../../../application/study-session/getSessionSummary';
import type { SessionSummary } from '../../../domain/study-session/summary';
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; summary: SessionSummary };
export function useSessionSummary(sessionId: string) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getSessionSummary(sessionId).then(summary => {
      if (!cancelled) setState({ kind: 'ready', summary });
    }).catch(() => { if (!cancelled) setState({ kind: 'error' }); });
    return () => { cancelled = true; };
  }, [sessionId, revision]);
  return { state, retry: () => { setState({ kind: 'loading' }); setRevision(value => value + 1); } };
}
