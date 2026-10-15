import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { findResumableStudySession } from '../../../application/study-session/resumeStudySession';
import type { StudySession } from '../../../domain/pte/types';
import { sessionMessage } from '../services/loadStudySession';
import type { startPracticeSession } from '../services/sessionStartDependencies';

/** One shared discovery and synchronous start gate for all modes on the Study page. */
export function useActiveStudySession() {
  const navigate = useNavigate();
  const [active, setActive] = useState<StudySession>();
  const [checking, setChecking] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const mounted = useRef(false), busy = useRef(false), discovery = useRef(0);
  async function check() {
    const generation = ++discovery.current;
    setChecking(true); setError(undefined);
    try {
      const result = await findResumableStudySession();
      if (mounted.current && generation === discovery.current) setActive(result?.session);
    } catch (error) {
      if (mounted.current && generation === discovery.current) setError(sessionMessage(error));
    } finally { if (mounted.current && generation === discovery.current) setChecking(false); }
  }
  useEffect(() => {
    mounted.current = true;
    const generation = ++discovery.current;
    void findResumableStudySession().then(result => {
      if (mounted.current && generation === discovery.current) setActive(result?.session);
    }).catch(error => {
      if (mounted.current && generation === discovery.current) setError(sessionMessage(error));
    }).finally(() => {
      if (mounted.current && generation === discovery.current) setChecking(false);
    });
    return () => { mounted.current = false; };
  }, []);
  async function start(prepare: () => ReturnType<typeof startPracticeSession>) {
    if (busy.current || checking) return;
    busy.current = true; setStarting(true); setError(undefined);
    try {
      if (active) { navigate(`/study/session/${encodeURIComponent(active.id)}`); return; }
      const result = await prepare();
      if (!mounted.current) return;
      if (result.kind === 'started') navigate(`/study/session/${encodeURIComponent(result.session.id)}`);
      else setActive(result.session);
    } catch (error) {
      if (mounted.current) setError(sessionMessage(error));
      return error;
    } finally { busy.current = false; if (mounted.current) setStarting(false); }
  }
  return { active, checking, starting, error, check, start, clearError: () => setError(undefined) };
}
export type ActiveStudySessionController = ReturnType<typeof useActiveStudySession>;
