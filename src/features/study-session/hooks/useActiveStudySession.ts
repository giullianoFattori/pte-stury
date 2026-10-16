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
  const [known, setKnown] = useState(false);
  const [checking, setChecking] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const mounted = useRef(false), busy = useRef(false), discovery = useRef(0);
  async function check() {
    const generation = ++discovery.current;
    setChecking(true); setKnown(false); setError(undefined);
    try {
      const result = await findResumableStudySession();
      if (mounted.current && generation === discovery.current) { setActive(result?.session); setKnown(true); }
    } catch (error) {
      if (mounted.current && generation === discovery.current) setError(sessionMessage(error));
    } finally { if (mounted.current && generation === discovery.current) setChecking(false); }
  }
  useEffect(() => {
    mounted.current = true;
    const generation = ++discovery.current;
    void findResumableStudySession().then(result => {
      if (mounted.current && generation === discovery.current) { setActive(result?.session); setKnown(true); }
    }).catch(error => {
      if (mounted.current && generation === discovery.current) setError(sessionMessage(error));
    }).finally(() => {
      if (mounted.current && generation === discovery.current) setChecking(false);
    });
    return () => { mounted.current = false; };
  }, []);
  async function start(prepare: () => ReturnType<typeof startPracticeSession>) {
    if (busy.current || checking || !known) return;
    busy.current = true; setStarting(true); setError(undefined);
    try {
      if (active) return;
      const result = await prepare();
      if (!mounted.current) return;
      if (result.kind === 'started') await navigate(`/study/session/${encodeURIComponent(result.session.id)}`);
      else setActive(result.session);
    } catch (error) {
      if (mounted.current) setError(sessionMessage(error));
      return error;
    } finally { busy.current = false; if (mounted.current) setStarting(false); }
  }
  async function resume() {
    if (!active || !known || checking || busy.current) return;
    busy.current = true; setStarting(true);
    try { await navigate(`/study/session/${encodeURIComponent(active.id)}`); }
    finally { busy.current = false; if (mounted.current) setStarting(false); }
  }
  return { resume, active, known, checking, starting, error, check, start, clearError: () => { if (known) setError(undefined); } };
}
export type ActiveStudySessionController = ReturnType<typeof useActiveStudySession>;
