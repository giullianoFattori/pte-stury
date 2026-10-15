import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { findResumableStudySession } from '../../application/study-session/resumeStudySession';
import type { StudySession } from '../../domain/pte/types';
import { startQuickPractice } from './services/startQuickPractice';
import { sessionMessage } from './services/loadStudySession';

export function QuickPracticeButton() {
  const navigate = useNavigate();
  const [active, setActive] = useState<StudySession>();
  const [checking, setChecking] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const mounted = useRef(false);
  const busy = useRef(false);
  const discovery = useRef(0);
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
  async function start() {
    if (busy.current || checking) return;
    busy.current = true; setStarting(true); setError(undefined);
    try {
      if (active) {
        navigate(`/study/session/${encodeURIComponent(active.id)}`);
        return;
      }
      const result = await startQuickPractice();
      if (!mounted.current) return;
      if (result.kind === 'started') navigate(`/study/session/${encodeURIComponent(result.session.id)}`);
      else setActive(result.session); // A racing tab created a session: present Resume, never abandon.
    } catch (error) {
      if (mounted.current) setError(sessionMessage(error));
    } finally { busy.current = false; if (mounted.current) setStarting(false); }
  }
  return (
    <section className="quick-practice" aria-labelledby="quick-practice-title" aria-busy={checking || starting}>
      <h3 id="quick-practice-title">Quick Practice</h3>
      <p>{active ? 'Continue your saved practice.' : '5 questions · mixed tasks'}</p>
      {checking && <p role="status">Checking for a session…</p>}
      {active && <p role="status">Question {Math.min(active.currentIndex + 1, active.itemIds.length)} of {active.itemIds.length}</p>}
      <button type="button" disabled={checking || starting || !!error} onClick={() => void start()}>
        {starting ? 'Starting…' : active ? 'Resume current session' : 'Start Quick Practice'}
      </button>
      {error && <><p role="alert">{error}</p><button type="button" onClick={() => void check()} disabled={checking || starting}>Check again</button></>}
    </section>
  );
}
