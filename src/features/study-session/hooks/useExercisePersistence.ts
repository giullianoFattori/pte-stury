import { useEffect, useRef, useState } from 'react';
import type { ExerciseProps, ExerciseCompletion } from '../types';
import { STANDALONE_EXERCISE_MODE } from '../types';
import { persistExerciseOutcome, exercisePersistenceError, type ExerciseOutcome, type ExercisePersistenceError } from '../services/persistExerciseOutcome';

/** Only persistence state is shared; each exercise retains its scoring and speech state. */
export function useExercisePersistence({ item, mode = STANDALONE_EXERCISE_MODE, onCompleted }: ExerciseProps) {
  const phase = useRef<'idle' | 'saving' | 'saved'>('idle');
  const mounted = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAttemptId, setSavedAttemptId] = useState<string | null>(null);
  const [error, setError] = useState<ExercisePersistenceError | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const isSessionSaved = mode.kind === 'session' && savedAttemptId !== null;
  const isBlocked = () => phase.current === 'saving' || mode.kind === 'session' && phase.current === 'saved';
  function reset() {
    if (isBlocked()) return;
    phase.current = 'idle'; setSavedAttemptId(null); setError(null);
  }
  async function saveOutcome(build: () => ExerciseOutcome) {
    if (!mounted.current || phase.current !== 'idle') return;
    phase.current = 'saving'; setIsSaving(true); setError(null);
    let completion: ExerciseCompletion;
    try {
      completion = await persistExerciseOutcome({ ...build(), item, mode, now: () => new Date().toISOString() });
      phase.current = 'saved';
      if (mounted.current) setSavedAttemptId(completion.attemptId);
    } catch (error) {
      phase.current = 'idle';
      if (mounted.current) setError(exercisePersistenceError(error));
      return;
    } finally { if (mounted.current) setIsSaving(false); }
    // Callback errors cannot undo a committed save or reopen the save gate.
    try { onCompleted?.(completion); } catch { console.error('Exercise completion handler failed.'); }
    return completion;
  }
  return { saveOutcome, reset, isBlocked, isSaving, savedAttemptId, error, isSessionSaved };
}
