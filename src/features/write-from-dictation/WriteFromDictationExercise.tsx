import { useEffect, useRef, useState } from 'react';
import { exerciseIdentity, type ExerciseProps } from '../study-session/types';
import { useExercisePersistence } from '../study-session/hooks/useExercisePersistence';
import { calculateWfdMetrics, compareWfdAnswer, type WfdComparisonResult as Comparison, type WfdScoreResult } from '../../domain/scoring/wfd';
import { buildWfdAttempt } from './services/buildWfdAttempt';
import { buildWfdErrorRecords } from './services/buildWfdErrorRecords';
import { buildWfdReviewItems } from './services/buildWfdReviewItems';
import { WfdAnswerInput } from './components/WfdAnswerInput';
import { WfdAudioPlayer } from './components/WfdAudioPlayer';
import { WfdComparisonResult } from './components/WfdComparisonResult';

export function WriteFromDictationExercise(props: ExerciseProps) {
  return <WriteFromDictationExerciseBody key={exerciseIdentity(props)} {...props} />;
}

function WriteFromDictationExerciseBody(props: ExerciseProps) {
  const { item: currentQuestion, mode, onNext, progress } = props;
  const persistence = useExercisePersistence(props);
  const { isSaving, savedAttemptId } = persistence;
  const saveError = persistence.error?.message;
  const [answer, setAnswer] = useState('');
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [score, setScore] = useState<WfdScoreResult | null>(null);
  const attemptStartedAtRef = useRef(0);
  useEffect(() => { attemptStartedAtRef.current = performance.now(); }, []);
  const isSubmitted = savedAttemptId !== null;
  function updateAnswer(value: string) {
    if (persistence.isBlocked() || isSubmitted) return;
    persistence.reset(); setAnswer(value); setComparison(null); setScore(null);
  }
  async function submitAnswer() {
    if (!answer.trim() || !currentQuestion.answer) return;
    const expectedAnswer = currentQuestion.answer;
    await persistence.saveOutcome(() => {
      const comparisonResult = compareWfdAnswer(expectedAnswer, answer);
      const scoreResult = calculateWfdMetrics(comparisonResult);
      const durationMs = Math.round(performance.now() - attemptStartedAtRef.current);
      const attempt = buildWfdAttempt({
        question: currentQuestion,
        answer,
        comparison: comparisonResult,
        score: scoreResult,
        durationMs,
      });

      const errors = buildWfdErrorRecords(attempt, comparisonResult);
      const reviews = buildWfdReviewItems({ question: currentQuestion, attempt, errors });
      // Feedback can remain on screen while the persisted session already points forward.
      setComparison(comparisonResult); setScore(scoreResult);
      return { attempt, errors, reviews };
    });
  }
  return (
    <section className="practice-card" aria-labelledby="wfd-title" aria-busy={isSaving}>
      <header><p className="eyebrow">Listening + Writing</p><h2 id="wfd-title">Write From Dictation</h2></header>
      {progress && <p className="wfd-progress" role="status">Question {progress.currentIndex + 1} of {progress.total}</p>}
      <p>{currentQuestion.prompt}</p>

      {currentQuestion.audioUrl ? (
        <WfdAudioPlayer key={currentQuestion.id} audioUrl={currentQuestion.audioUrl} />
      ) : (
        <p>Audio unavailable for this question.</p>
      )}

      <WfdAnswerInput value={answer} onChange={updateAnswer} disabled={isSubmitted || isSaving} />

      {saveError && <p role="alert">{saveError}</p>}

      {!currentQuestion.answer && <p>Comparison unavailable for this question.</p>}

      {isSubmitted && comparison && score && (
        <WfdComparisonResult result={comparison} score={score} />
      )}

      <div className="wfd-actions">
        {!isSubmitted ? (
          <button
            type="button"
            onClick={() => void submitAnswer()}
            disabled={!answer.trim() || !currentQuestion.answer || isSaving}
          >
            {isSaving ? 'Saving…' : 'Submit'}
          </button>
        ) : (
          <>
            {savedAttemptId && (
              <p role="status">Attempt saved. Your word-level result is ready.</p>
            )}
            {mode?.kind !== 'session' && onNext && (
              <button type="button" onClick={onNext}>Next question</button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
