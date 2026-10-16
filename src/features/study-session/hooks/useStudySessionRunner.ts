import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { endStudySession } from '../services/endStudySession';
import { loadStudySession, sessionMessage } from '../services/loadStudySession';
import type { ExerciseCompletion } from '../types';
import type { ExercisePersistenceError } from '../services/persistExerciseOutcome';

type LoadedSession = Awaited<ReturnType<typeof loadStudySession>>;
type RunnerState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; result: LoadedSession; saved: boolean };
export function useStudySessionRunner(id: string) {
  const navigate = useNavigate();
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const endGate = useRef(false);
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
    setState({ kind: 'loading' }); setConflict(false); setNotice(undefined); return load();
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
    if (['SESSION_PROGRESS_CONFLICT', 'SESSION_NOT_ACTIVE', 'SESSION_ALREADY_COMPLETED'].includes(error.code)) { setConfirmingEnd(false); setConflict(true); }
  }
  function requestEnd() { setEndError(undefined); setConfirmingEnd(true); }
  function keepStudying() { if (!endGate.current) setConfirmingEnd(false); }
  async function confirmEnd() {
    if (endGate.current || !mounted.current) return;
    endGate.current = true; setEnding(true); setEndError(undefined);
    try {
      const result = await endStudySession(id, () => new Date().toISOString());
      if (!mounted.current) return;
      setConfirmingEnd(false);
      if (result.kind === 'ended') await navigate('/study');
      else {
        setConflict(false); setState({ kind: 'ready', result: result.view, saved: false });
        setNotice('The session changed while you were ending it. Its latest state is shown.');
      }
    } catch {
      if (mounted.current) setEndError('This session could not be ended. Please try again.');
    } finally { endGate.current = false; if (mounted.current) setEnding(false); }
  }
  return { state, conflict, reload, onCompleted, onPersistenceError,
    confirmingEnd, ending, endError, notice, requestEnd, keepStudying, confirmEnd };
}
