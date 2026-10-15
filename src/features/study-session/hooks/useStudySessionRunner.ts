import { useCallback, useEffect, useRef, useState } from 'react';
import { loadStudySession, sessionMessage } from '../services/loadStudySession';
import type { ExerciseCompletion } from '../types';
import type { ExercisePersistenceError } from '../services/persistExerciseOutcome';

type LoadedSession = Awaited<ReturnType<typeof loadStudySession>>;
type RunnerState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; result: LoadedSession; saved: boolean };
export function useStudySessionRunner(id: string) {
  const [state, setState] = useState<RunnerState>({ kind: 'loading' });
  const [conflict, setConflict] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(false);
  const load = useCallback(async () => {
    const current = ++generation.current;
    try {
      const result = await loadStudySession(id);
      if (mounted.current && current === generation.current) setState({ kind: 'ready', result, saved: false });
    } catch (error) {
      if (mounted.current && current === generation.current) setState({ kind: 'error', message: sessionMessage(error) });
    }
  }, [id]);
  const reload = useCallback(() => {
    setState({ kind: 'loading' }); setConflict(false); return load();
  }, [load]);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void loadStudySession(id).then(result => {
      if (!cancelled) setState({ kind: 'ready', result, saved: false });
    }).catch(error => {
      if (!cancelled) setState({ kind: 'error', message: sessionMessage(error) });
    });
    return () => { cancelled = true; mounted.current = false; };
  }, [id]);
  function onCompleted(completion: ExerciseCompletion) {
    setState(previous => {
      if (previous.kind !== 'ready' || previous.result.kind !== 'item'
        || completion.session?.id !== id || completion.itemId !== previous.result.item.id) return previous;
      // Keep the exact presented item/position for feedback. Continue re-reads storage.
      return { ...previous, saved: true };
    });
  }
  function onPersistenceError(error: ExercisePersistenceError) {
    if (['SESSION_PROGRESS_CONFLICT', 'SESSION_NOT_ACTIVE', 'SESSION_ALREADY_COMPLETED'].includes(error.code)) setConflict(true);
  }
  return { state, conflict, reload, onCompleted, onPersistenceError };
}
