import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { readTaskData } from '../../domain/content/taskDataValidation.ts';
import { scoreListeningFillBlanks } from '../../domain/scoring/listening-fill-blanks/index.ts';
import { startCountdown } from '../../shared/speech/timing.ts';
import { exerciseIdentity, type ExerciseProps } from '../study-session/types.ts';
import { useExercisePersistence } from '../study-session/hooks/useExercisePersistence.ts';
import { buildListeningFillBlanksAttempt } from './services/buildListeningFillBlanksAttempt.ts';
import { buildListeningFillBlanksErrorRecords } from './services/buildListeningFillBlanksErrorRecords.ts';
import { buildListeningFillBlanksReviewItems } from './services/buildListeningFillBlanksReviewItems.ts';

export const LFB_SKIM_MS = 7_000;
type Flow = 'ready' | 'preview' | 'listening' | 'answer-ready' | 'submitted' | 'saved';
export function ListeningFillBlanksTypeInExercise(props: ExerciseProps) { return <ListeningFillBlanksBody key={exerciseIdentity(props)} {...props} />; }
function ListeningFillBlanksBody(props: ExerciseProps) {
  const { item, mode, onNext, progress } = props;
  const data = useMemo(() => readTaskData(item, 'listening-fill-blanks-type-in'), [item]);
  const persistence = useExercisePersistence(props);
  const [flow, setFlow] = useState<Flow>('ready'), [remaining, setRemaining] = useState(LFB_SKIM_MS), [answers, setAnswers] = useState<Record<string, string>>(() => Object.fromEntries(data.blanks.map(blank => [blank.id, '']))), [playbackError, setPlaybackError] = useState<string | null>(null);
  const flowRef = useRef<Flow>('ready'), timerRef = useRef<(() => void) | null>(null), audioRef = useRef<HTMLAudioElement>(null), startRef = useRef(0), durationRef = useRef(0), playedRef = useRef(false), submitRef = useRef<() => void>(() => {}), blocked = persistence.isSaving || persistence.isSessionSaved;
  const score = useMemo(() => scoreListeningFillBlanks(data.blanks, answers), [data.blanks, answers]);
  function changeFlow(next: Flow) { flowRef.current = next; setFlow(next); }
  function failPlayback() { if (flowRef.current !== 'preview' && flowRef.current !== 'listening') return; timerRef.current?.(); timerRef.current = null; playedRef.current = false; setPlaybackError('The local audio could not be played. Start the question again to retry.'); changeFlow('ready'); }
  function playSource() { const audio = audioRef.current; if (!audio) { failPlayback(); return; } changeFlow('listening'); playedRef.current = true; void audio.play().catch(failPlayback); }
  useEffect(() => { submitRef.current = () => { if (flowRef.current !== 'answer-ready' || blocked || !playedRef.current) return; durationRef.current = Math.max(0, performance.now() - startRef.current); changeFlow('submitted'); }; });
  useEffect(() => () => { timerRef.current?.(); timerRef.current = null; if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; } }, []);
  function start() { if (flowRef.current !== 'ready' || blocked) return; const audio = audioRef.current; if (!audio) { setPlaybackError('The local audio is unavailable.'); return; } setPlaybackError(null); setAnswers(Object.fromEntries(data.blanks.map(blank => [blank.id, '']))); setRemaining(LFB_SKIM_MS); playedRef.current = false; startRef.current = performance.now(); audio.pause(); audio.currentTime = 0; changeFlow('preview'); timerRef.current = startCountdown(LFB_SKIM_MS, ms => setRemaining(ms), () => { timerRef.current = null; playSource(); }); }
  function ended() { if (flowRef.current === 'listening') changeFlow('answer-ready'); }
  function reset() { if (persistence.isBlocked()) return; timerRef.current?.(); timerRef.current = null; persistence.reset(); playedRef.current = false; durationRef.current = 0; setAnswers(Object.fromEntries(data.blanks.map(blank => [blank.id, '']))); setRemaining(LFB_SKIM_MS); setPlaybackError(null); if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; } changeFlow('ready'); }
  async function save() { if (flow !== 'submitted' || persistence.isBlocked() || persistence.savedAttemptId) return; const result = await persistence.saveOutcome(() => { const attempt = buildListeningFillBlanksAttempt({ question: item, answers, durationMs: durationRef.current, sourcePlaybackStarted: playedRef.current }); const errors = buildListeningFillBlanksErrorRecords(item, attempt); return { attempt, errors, reviews: buildListeningFillBlanksReviewItems(item, attempt, errors) }; }); if (result) changeFlow('saved'); }
  const accepting = flow === 'listening' || flow === 'answer-ready';
  return <section className="practice-card" aria-labelledby="lfb-title" aria-busy={persistence.isSaving}>
    <header><p className="eyebrow">Listening</p><h2 id="lfb-title">Listening: Fill in the Blanks — Type In</h2></header>
    {progress && <p role="status">Question {progress.currentIndex + 1} of {progress.total}</p>}<p>{item.prompt}</p>
    <section aria-label="Transcript with missing words"><h3>Transcript</h3><p className="lfb-transcript">{data.transcriptSegments.map((segment, index) => <Fragment key={index}>{segment}{index < data.blanks.length && <input aria-label={`Blank ${index + 1} of ${data.blanks.length}`} autoComplete="off" spellCheck={false} maxLength={200} value={answers[data.blanks[index].id] ?? ''} disabled={!accepting || blocked} onChange={event => setAnswers(current => ({ ...current, [data.blanks[index].id]: event.target.value }))} className="lfb-blank" />}</Fragment>)}</p></section>
    <section aria-label="Source audio"><audio ref={audioRef} src={data.audio.path} preload="metadata" onEnded={ended} onError={failPlayback} /><p>Locally synthesized voice · one playback per attempt · 30–60 seconds</p>{flow === 'ready' && <><p>Start to skim the transcript for 7 seconds. Audio begins automatically; answers unlock when playback starts.</p><button type="button" disabled={blocked} onClick={start}>Start question</button></>}{flow === 'preview' && <p role="timer" aria-live="off">Skim the transcript. Audio starts in {Math.ceil(remaining / 1000)} seconds.</p>}{flow === 'listening' && <p role="status">Audio is playing once. Type the missing words; answers remain editable after playback.</p>}{flow === 'answer-ready' && <p role="status">Audio ended. Review spelling, then submit.</p>}{playbackError && <p role="alert">{playbackError}</p>}</section>
    {flow === 'answer-ready' && <button type="button" disabled={blocked} onClick={() => submitRef.current()}>Submit response</button>}
    {(flow === 'submitted' || flow === 'saved') && <><section aria-label="Scoring results"><h3>Score</h3><p>{score.rawScore} / {score.maxScore} · {Math.round(score.accuracyPercent)}% blank accuracy</p><p>Correct: {score.correctCount} · Incorrect: {score.incorrectCount} · Unanswered: {score.unansweredCount}</p>{score.results.map((result, index) => <p key={result.blankId}><strong>Blank {index + 1}:</strong> {result.correct ? `✓ ${result.expected}` : result.unanswered ? `○ Not answered · Correct: ${result.expected}` : `✕ Learner: ${result.actual} · Correct: ${result.expected}`}</p>)}</section><p>Each exact correctly spelled word earns one local practice point; wrong or unanswered blanks earn zero. No negative marking.</p><button type="button" disabled={blocked || !!persistence.savedAttemptId} onClick={() => void save()}>{persistence.savedAttemptId ? 'Attempt saved' : 'Save attempt'}</button>{persistence.error && <p role="alert">{persistence.error.message}</p>}{persistence.savedAttemptId && <p role="status">Saved locally.</p>}{mode?.kind !== 'session' && persistence.savedAttemptId && <button type="button" onClick={reset}>Retry this item</button>}</>}
    {flow === 'saved' && mode?.kind !== 'session' && onNext && <button type="button" onClick={() => { reset(); onNext(); }}>Next question</button>}
    <small>Comparison trims outer whitespace and ignores capitalization, but spelling and word form must match exactly. This is item-level practice scoring, not a Listening section score.</small>
  </section>;
}
