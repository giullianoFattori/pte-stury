import { useEffect, useMemo, useRef, useState } from 'react';
import { readTaskData } from '../../domain/content/taskDataValidation.ts';
import { scoreReorderParagraph, shuffleParagraphIds } from '../../domain/scoring/reorder-paragraph/index.ts';
import { exerciseIdentity, type ExerciseProps } from '../study-session/types.ts';
import { useExercisePersistence } from '../study-session/hooks/useExercisePersistence.ts';
import { buildReorderParagraphAttempt } from './services/buildReorderParagraphAttempt.ts';
import { buildReorderParagraphErrorRecords } from './services/buildReorderParagraphErrorRecords.ts';
import { buildReorderParagraphReviewItems } from './services/buildReorderParagraphReviewItems.ts';

export function ReorderParagraphExercise(props: ExerciseProps) { return <ReorderParagraphBody key={exerciseIdentity(props)} {...props} />; }
function ReorderParagraphBody(props: ExerciseProps) {
  const { item, mode, onNext, progress } = props;
  const data = useMemo(() => readTaskData(item, 'reorder-paragraph'), [item]);
  const identity = exerciseIdentity(props), persistence = useExercisePersistence(props);
  const byId = useMemo(() => new Map(data.blocks.map(block => [block.id, block])), [data.blocks]);
  const [retryNumber, setRetryNumber] = useState(0);
  const [order, setOrder] = useState(() => shuffleParagraphIds(data.blocks.map(block => block.id), data.correctOrder, identity));
  const [submitted, setSubmitted] = useState(false), [announcement, setAnnouncement] = useState('Use Move up and Move down to arrange the sentences.');
  const startedAt = useRef<number | null>(null);
  useEffect(() => { startedAt.current ??= performance.now(); }, []);
  const blocked = persistence.isSaving || persistence.isSessionSaved;
  const result = useMemo(() => scoreReorderParagraph(data.correctOrder, order), [data.correctOrder, order]);

  function move(id: string, direction: -1 | 1) {
    if (submitted || blocked) return;
    const index = order.indexOf(id), destination = index + direction;
    if (index < 0 || destination < 0 || destination >= order.length) return;
    setOrder(current => {
      const currentIndex = current.indexOf(id), currentDestination = currentIndex + direction;
      if (currentIndex < 0 || currentDestination < 0 || currentDestination >= current.length) return current;
      const next = [...current]; [next[currentIndex], next[currentDestination]] = [next[currentDestination], next[currentIndex]];
      return next;
    });
    setAnnouncement(`Moved block ${index + 1} to position ${destination + 1} of ${order.length}.`);
  }
  function reset() {
    if (persistence.isBlocked()) return;
    const nextRetry = retryNumber + 1;
    persistence.reset(); setRetryNumber(nextRetry); setOrder(shuffleParagraphIds(data.blocks.map(block => block.id), data.correctOrder, `${identity}:${nextRetry}`));
    setSubmitted(false); setAnnouncement('New attempt started. Use Move up and Move down to arrange the sentences.'); startedAt.current = performance.now();
  }
  async function save() {
    if (!submitted || blocked || persistence.savedAttemptId) return;
    await persistence.saveOutcome(() => {
      const attempt = buildReorderParagraphAttempt({ question: item, responseOrder: order, durationMs: Math.max(0, performance.now() - (startedAt.current ?? performance.now())) });
      const errors = buildReorderParagraphErrorRecords(item, attempt);
      return { attempt, errors, reviews: buildReorderParagraphReviewItems(item, attempt, errors) };
    });
  }
  const text = (id: string) => byId.get(id)?.text ?? '';
  return <section className="practice-card" aria-labelledby="rop-title" aria-busy={persistence.isSaving}>
    <header><p className="eyebrow">Reading</p><h2 id="rop-title">Reorder Paragraph</h2></header>
    {progress && <p role="status">Question {progress.currentIndex + 1} of {progress.total}</p>}
    <p>{item.prompt}</p><p>Look for topic sentences, pronouns, linking words, chronology and cause and effect.</p>
    <ol className="rop-block-list" aria-label="Current paragraph order">{order.map((id, index) => <li key={id} aria-label={`Block ${index + 1} of ${order.length}`}>
      <p>{text(id)}</p>{!submitted && <div className="rop-controls"><span>Position {index + 1} of {order.length}</span><button type="button" aria-label={`Move block ${index + 1} up`} disabled={blocked || index === 0} onClick={() => move(id, -1)}>Move up</button><button type="button" aria-label={`Move block ${index + 1} down`} disabled={blocked || index === order.length - 1} onClick={() => move(id, 1)}>Move down</button></div>}
    </li>)}</ol>
    <p role="status" aria-live="polite">{announcement}</p>
    {!submitted && <button type="button" disabled={blocked} onClick={() => setSubmitted(true)}>Submit response</button>}
    {submitted && <><section aria-label="Reorder results"><h3>Score</h3><p>{result.rawScore} / {result.maxScore} adjacent pairs</p><p>Exact order: {result.exactOrder ? 'Yes' : 'No'}</p><h4>Links in your response</h4>{result.pairResults.map((pair, index) => <p key={`${pair.leftId}-${pair.rightId}-${index}`}>{pair.correct ? '✓' : '✕'} {text(pair.leftId).slice(0, 85)} → {text(pair.rightId).slice(0, 85)}</p>)}<h4>Correct order</h4><ol aria-label="Correct order">{data.correctOrder.map(id => <li key={id}>{text(id)}</li>)}</ol></section><p>Each correct adjacent pair earns one local practice point. This is not an official PTE Reading score.</p><button type="button" disabled={blocked || !!persistence.savedAttemptId} onClick={() => void save()}>{persistence.savedAttemptId ? 'Attempt saved' : 'Save attempt'}</button>{persistence.error && <p role="alert">{persistence.error.message}</p>}{persistence.savedAttemptId && <p role="status">Saved locally.</p>}{mode?.kind !== 'session' && persistence.savedAttemptId && <button type="button" onClick={reset}>Retry this paragraph</button>}</>}
    {persistence.savedAttemptId && mode?.kind !== 'session' && onNext && <button type="button" onClick={() => { reset(); onNext(); }}>Next paragraph</button>}
    <small>Practice metrics only; not an official PTE Reading section score.</small>
  </section>;
}
