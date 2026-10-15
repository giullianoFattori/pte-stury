import { useRepeatSentence } from './hooks/useRepeatSentence';
import { RepeatSentenceExercise } from './RepeatSentenceExercise';

export function RepeatSentencePage() {
  const { questions, currentQuestion, currentIndex, isLoading, error, nextQuestion } = useRepeatSentence();
  if (isLoading || error || !currentQuestion) return (
    <section className="practice-card" aria-busy={isLoading}>
      <h2>Repeat Sentence</h2>
      {isLoading ? <p role="status">Loading Repeat Sentence…</p> : error ? <p role="alert">{error}</p> : <p>No Repeat Sentence questions are available.</p>}
    </section>
  );
  return <RepeatSentenceExercise key={currentQuestion.id} item={currentQuestion} mode={{ kind: 'standalone' }}
    progress={{ currentIndex, total: questions.length }} onNext={nextQuestion} />;
}
