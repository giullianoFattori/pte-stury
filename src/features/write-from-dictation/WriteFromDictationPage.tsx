import { useWriteFromDictation } from './hooks/useWriteFromDictation';
import { WriteFromDictationExercise } from './WriteFromDictationExercise';

export function WriteFromDictationPage() {
  const { questions, currentQuestion, currentIndex, isLoading, error, nextQuestion } = useWriteFromDictation();
  if (isLoading || error || !currentQuestion) return (
    <section className="practice-card" aria-busy={isLoading}>
      <h2>Write From Dictation</h2>
      {isLoading ? <p role="status">Loading Write From Dictation…</p> : error ? <p role="alert">{error}</p> : <p>No questions are available.</p>}
    </section>
  );
  return <WriteFromDictationExercise key={currentQuestion.id} item={currentQuestion} mode={{ kind: 'standalone' }}
    progress={{ currentIndex, total: questions.length }} onNext={nextQuestion} />;
}
