import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { readTaskData } from '../../domain/content/taskDataValidation.ts';
import { scoreReadingFillBlanksDragDrop } from '../../domain/scoring/reading-fill-blanks-drag-drop/index.ts';
import { exerciseIdentity, type ExerciseProps } from '../study-session/types.ts';
import { useExercisePersistence } from '../study-session/hooks/useExercisePersistence.ts';
import { buildReadingFillBlanksDragDropAttempt } from './services/buildReadingFillBlanksDragDropAttempt.ts';
import { buildReadingFillBlanksDragDropErrorRecords } from './services/buildReadingFillBlanksDragDropErrorRecords.ts';
import { buildReadingFillBlanksDragDropReviewItems } from './services/buildReadingFillBlanksDragDropReviewItems.ts';

export function ReadingFillBlanksDragDropExercise(props: ExerciseProps) { return <DragDropBody key={exerciseIdentity(props)} {...props} />; }

function DragDropBody(props: ExerciseProps) {
  const { item, mode, onNext, progress } = props;
  const data = useMemo(() => readTaskData(item, 'reading-fill-blanks-drag-drop'), [item]);
  const persistence = useExercisePersistence(props);
  const [assignments, setAssignments] = useState<Record<string, string>>(() => Object.fromEntries(data.blanks.map(blank => [blank.id, ''])));
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [announcement, setAnnouncement] = useState('Choose a word from the bank, then choose a blank.');
  const startedAt = useRef<number | null>(null);
  useEffect(() => { startedAt.current ??= performance.now(); }, []);
  const blocked = persistence.isSaving || persistence.isSessionSaved;
  const score = useMemo(() => scoreReadingFillBlanksDragDrop(data.blanks, assignments, data.wordBank), [data.blanks, data.wordBank, assignments]);
  const usedWords = useMemo(() => new Set(Object.values(assignments).filter(Boolean)), [assignments]);

  function assign(blankId: string, word: string) {
    if (submitted || blocked || !data.wordBank.includes(word)) return;
    setAssignments(current => {
      const next = { ...current };
      for (const [id, value] of Object.entries(next)) if (value === word) next[id] = '';
      next[blankId] = word;
      return next;
    });
    setSelectedWord(null);
    setAnnouncement(`Assigned ${word} to blank ${data.blanks.findIndex(blank => blank.id === blankId) + 1}.`);
  }

  function selectWord(word: string) {
    if (submitted || blocked || usedWords.has(word)) return;
    const clearing = selectedWord === word;
    setSelectedWord(current => current === word ? null : word);
    setAnnouncement(clearing ? 'Word selection cleared.' : `Selected ${word}. Choose a blank.`);
  }

  function clearBlank(blankId: string) {
    if (submitted || blocked || !assignments[blankId]) return;
    const number = data.blanks.findIndex(blank => blank.id === blankId) + 1;
    setAssignments(current => ({ ...current, [blankId]: '' }));
    setAnnouncement(`Returned ${assignments[blankId]} from blank ${number} to the word bank.`);
  }

  function moveWord(blankId: string) {
    const word = assignments[blankId];
    if (!word || submitted || blocked) return;
    setSelectedWord(word);
    setAnnouncement(`Selected ${word} from blank ${data.blanks.findIndex(blank => blank.id === blankId) + 1}. Choose another blank to move it.`);
  }

  function dropOnBlank(event: DragEvent<HTMLButtonElement>, blankId: string) {
    event.preventDefault();
    const word = event.dataTransfer.getData('text/plain');
    if (word) assign(blankId, word);
  }

  function dropBackToBank(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const blankId = event.dataTransfer.getData('application/x-pte-source-blank');
    if (blankId) clearBlank(blankId);
  }

  function reset() {
    if (persistence.isBlocked()) return;
    persistence.reset(); setAssignments(Object.fromEntries(data.blanks.map(blank => [blank.id, '']))); setSelectedWord(null); setSubmitted(false); setAnnouncement('Choose a word from the bank, then choose a blank.'); startedAt.current = performance.now();
  }

  async function save() {
    if (!submitted || blocked || persistence.savedAttemptId) return;
    await persistence.saveOutcome(() => {
      const attempt = buildReadingFillBlanksDragDropAttempt({ question: item, assignments, durationMs: Math.max(0, performance.now() - (startedAt.current ?? performance.now())) });
      const errors = buildReadingFillBlanksDragDropErrorRecords(item, attempt);
      return { attempt, errors, reviews: buildReadingFillBlanksDragDropReviewItems(item, attempt, errors) };
    });
  }

  const assignedTo = (word: string) => data.blanks.findIndex(blank => assignments[blank.id] === word);

  return <section className="practice-card" aria-labelledby="rfbdd-title" aria-busy={persistence.isSaving}>
    <header><p className="eyebrow">Reading</p><h2 id="rfbdd-title">Reading: Fill in the Blanks — Drag and Drop</h2></header>
    {progress && <p role="status">Question {progress.currentIndex + 1} of {progress.total}</p>}
    <p>{item.prompt}</p>
    <p>Check collocation, grammar and meaning around each gap.</p>
    <section aria-label="Reading passage"><h3>Passage</h3><p className="rfbdd-passage">{data.segments.map((segment, index) => <Fragment key={index}>{segment}{index < data.blanks.length && (() => {
      const blank = data.blanks[index], value = assignments[blank.id];
      return <span className="rfbdd-gap" key={blank.id}>
        <button type="button" className="rfbdd-target" aria-label={`Blank ${index + 1} of ${data.blanks.length}, currently ${value || 'empty'}`} aria-describedby="rfbdd-assignment-help" disabled={submitted || blocked} draggable={!!value} onDragStart={event => { event.dataTransfer.setData('text/plain', value); event.dataTransfer.setData('application/x-pte-source-blank', blank.id); event.dataTransfer.effectAllowed = 'move'; }} onDragOver={event => event.preventDefault()} onDrop={event => dropOnBlank(event, blank.id)} onClick={() => selectedWord ? assign(blank.id, selectedWord) : value ? moveWord(blank.id) : setAnnouncement(`Blank ${index + 1} is empty. Select a bank word first.`)}>{value || 'Drop word here'}</button>
        {value && !submitted && <span className="rfbdd-blank-actions"><button type="button" onClick={() => moveWord(blank.id)} disabled={blocked} aria-label={`Move word from blank ${index + 1}`}>Move</button><button type="button" onClick={() => clearBlank(blank.id)} disabled={blocked} aria-label={`Clear blank ${index + 1}`}>Clear</button></span>}
      </span>;
    })()}</Fragment>)}</p></section>
    {!submitted && <section className="rfbdd-bank" aria-label="Word bank" onDragOver={event => event.preventDefault()} onDrop={dropBackToBank}>
      <h3>Word bank</h3><p id="rfbdd-assignment-help">Unused words remain here. Drag a word to a gap, or select a word and then a blank.</p>
      <div className="rfbdd-word-list">{data.wordBank.map(word => {
        const index = assignedTo(word), used = index >= 0;
        return <button type="button" key={word} draggable={!used && !blocked} disabled={blocked || used} aria-pressed={selectedWord === word} aria-label={used ? `${word}, used in blank ${index + 1}` : `Word ${word}`} onClick={() => selectWord(word)} onDragStart={event => { if (used) { event.preventDefault(); return; } event.dataTransfer.setData('text/plain', word); event.dataTransfer.effectAllowed = 'move'; }}>{word}{used ? ` (in blank ${index + 1})` : ''}</button>;
      })}</div>
    </section>}
    <p role="status" aria-live="polite">{announcement}{selectedWord ? ` Selected word: ${selectedWord}.` : ''}</p>
    {!submitted && <button type="button" disabled={blocked} onClick={() => { setSubmitted(true); setSelectedWord(null); }}>Submit response</button>}
    {submitted && <><section aria-label="Drag-and-drop results"><h3>Score</h3><p>{score.rawScore} / {score.maxScore} · {Math.round(score.accuracyPercent)}% blank accuracy</p><p>Correct: {score.correctCount} · Incorrect: {score.incorrectCount} · Unanswered: {score.unansweredCount}</p>{score.results.map((result, index) => <p key={result.blankId}><strong>Blank {index + 1}:</strong> {result.correct ? `✓ ${result.expected}` : result.unanswered ? `○ Not answered · Correct: ${result.expected}` : `✕ Learner: ${result.actual} · Correct: ${result.expected}`}</p>)}</section><p>Each correct blank earns one local practice point. Incorrect and unanswered blanks earn zero; there is no negative marking.</p><button type="button" disabled={blocked || !!persistence.savedAttemptId} onClick={() => void save()}>{persistence.savedAttemptId ? 'Attempt saved' : 'Save attempt'}</button>{persistence.error && <p role="alert">{persistence.error.message}</p>}{persistence.savedAttemptId && <p role="status">Saved locally.</p>}{mode?.kind !== 'session' && persistence.savedAttemptId && <button type="button" onClick={reset}>Retry this passage</button>}</>}
    {persistence.savedAttemptId && mode?.kind !== 'session' && onNext && <button type="button" onClick={() => { reset(); onNext(); }}>Next passage</button>}
    <small>Item practice points only; not an official PTE Reading section score.</small>
  </section>;
}
