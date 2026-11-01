import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { readTaskData } from '../../domain/content/taskDataValidation.ts';
import { scoreReadingFillBlanksDropdown } from '../../domain/scoring/reading-fill-blanks-dropdown/index.ts';
import { exerciseIdentity, type ExerciseProps } from '../study-session/types.ts';
import { useExercisePersistence } from '../study-session/hooks/useExercisePersistence.ts';
import { buildReadingFillBlanksDropdownAttempt } from './services/buildReadingFillBlanksDropdownAttempt.ts';
import { buildReadingFillBlanksDropdownErrorRecords } from './services/buildReadingFillBlanksDropdownErrorRecords.ts';
import { buildReadingFillBlanksDropdownReviewItems } from './services/buildReadingFillBlanksDropdownReviewItems.ts';

export function ReadingFillBlanksDropdownExercise(props: ExerciseProps) { return <ReadingFillBlanksDropdownBody key={exerciseIdentity(props)} {...props} />; }
function ReadingFillBlanksDropdownBody(props: ExerciseProps) {
  const { item, mode, onNext, progress } = props;
  const data = useMemo(() => readTaskData(item, 'reading-fill-blanks-dropdown'), [item]);
  const persistence = useExercisePersistence(props);
  const [answers, setAnswers] = useState<Record<string, string>>(() => Object.fromEntries(data.blanks.map(blank => [blank.id, ''])));
  const [submitted, setSubmitted] = useState(false);
  const startedAt = useRef<number | null>(null);
  useEffect(() => { startedAt.current ??= performance.now(); }, []);
  const blocked = persistence.isSaving || persistence.isSessionSaved;
  const score = useMemo(() => scoreReadingFillBlanksDropdown(data.blanks, answers), [data.blanks, answers]);

  function reset() {
    if (persistence.isBlocked()) return;
    persistence.reset(); setSubmitted(false); setAnswers(Object.fromEntries(data.blanks.map(blank => [blank.id, '']))); startedAt.current = performance.now();
  }
  async function save() {
    if (!submitted || blocked || persistence.savedAttemptId) return;
    await persistence.saveOutcome(() => {
      const attempt = buildReadingFillBlanksDropdownAttempt({ question: item, answers, durationMs: Math.max(0, performance.now() - (startedAt.current ?? performance.now())) });
      const errors = buildReadingFillBlanksDropdownErrorRecords(item, attempt);
      return { attempt, errors, reviews: buildReadingFillBlanksDropdownReviewItems(item, attempt, errors) };
    });
  }

  return <section className="practice-card" aria-labelledby="rfbd-title" aria-busy={persistence.isSaving}>
    <header><p className="eyebrow">Reading</p><h2 id="rfbd-title">Reading: Fill in the Blanks — Dropdown</h2></header>
    {progress && <p role="status">Question {progress.currentIndex + 1} of {progress.total}</p>}
    <p>{item.prompt}</p>
    <p>Check meaning, grammar and collocation around each blank.</p>
    <section aria-label="Reading passage"><h3>Passage</h3><p className="rfbd-passage">{data.segments.map((segment, index) => <Fragment key={index}>{segment}{index < data.blanks.length && <select aria-label={`Blank ${index + 1} of ${data.blanks.length}`} value={answers[data.blanks[index].id] ?? ''} disabled={submitted || blocked} onChange={event => setAnswers(current => ({ ...current, [data.blanks[index].id]: event.target.value }))}><option value="">Select…</option>{data.blanks[index].options.map(option => <option value={option} key={option}>{option}</option>)}</select>}</Fragment>)}</p></section>
    {!submitted && <button type="button" disabled={blocked} onClick={() => setSubmitted(true)}>Submit response</button>}
    {submitted && <><section aria-label="Dropdown results"><h3>Score</h3><p>{score.rawScore} / {score.maxScore} · {Math.round(score.accuracyPercent)}% blank accuracy</p><p>Correct: {score.correctCount} · Incorrect: {score.incorrectCount} · Unanswered: {score.unansweredCount}</p>{score.results.map((result, index) => <p key={result.blankId}><strong>Blank {index + 1}:</strong> {result.correct ? `✓ ${result.expected}` : result.unanswered ? `○ Not answered · Correct: ${result.expected}` : `✕ Learner: ${result.actual} · Correct: ${result.expected}`}</p>)}</section><p>Each correct selected option earns one local practice point. Incorrect and unanswered blanks earn zero; there is no negative marking.</p><button type="button" disabled={blocked || !!persistence.savedAttemptId} onClick={() => void save()}>{persistence.savedAttemptId ? 'Attempt saved' : 'Save attempt'}</button>{persistence.error && <p role="alert">{persistence.error.message}</p>}{persistence.savedAttemptId && <p role="status">Saved locally.</p>}{mode?.kind !== 'session' && persistence.savedAttemptId && <button type="button" onClick={reset}>Retry this passage</button>}</>}
    {persistence.savedAttemptId && mode?.kind !== 'session' && onNext && <button type="button" onClick={() => { reset(); onNext(); }}>Next passage</button>}
    <small>Item practice points only; not an official PTE Reading section score.</small>
  </section>;
}
