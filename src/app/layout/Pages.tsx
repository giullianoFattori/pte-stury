import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { db } from '../../data/db/database';

export function HomePage() {
  const [storageStatus, setStorageStatus] = useState('Checking local storage…');

  useEffect(() => {
    let isMounted = true;

    void db.settings
      .put({
        key: 'pteSpecVersion',
        value: '2026-10-01',
      })
      .then(() => db.settings.get('pteSpecVersion'))
      .then((setting) => {
        if (isMounted) {
          setStorageStatus(
            setting ? 'Local IndexedDB storage is ready.' : 'Storage check returned no value.',
          );
        }
      })
      .catch(() => {
        if (isMounted) {
          setStorageStatus('Local storage is unavailable. Check browser permissions.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section className="welcome-card">
      <p className="eyebrow">PTE practice</p>
      <h2>Welcome to PTE Study</h2>
      <p>
        Open Study to practise core PTE tasks. Your attempts, feedback, and reviews
        are stored locally in this browser.
      </p>
      <p className="storage-status" role="status">
        {storageStatus}
      </p>
    </section>
  );
}

export function StudyPage() {
  return (
    <section className="practice-card">
      <p className="eyebrow">Practice</p>
      <h2>Study</h2>
      <p>Choose a PTE task to practise.</p>
      <div className="study-exercise-links">
        <Link className="study-exercise-link" to="/study/write-from-dictation">
          Write From Dictation
        </Link>
        <Link className="study-exercise-link" to="/study/repeat-sentence">
          Repeat Sentence
        </Link>
        <Link className="study-exercise-link" to="/study/read-aloud">
          Read Aloud
        </Link>
      </div>
    </section>
  );
}

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <section className="placeholder-card">
      <p className="eyebrow">Coming next</p>
      <h2>{title}</h2>
      <p>This route is reserved for a future feature slice.</p>
    </section>
  );
}
