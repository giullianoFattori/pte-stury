import { useReadAloud } from './hooks/useReadAloud';
import { ReadAloudExercise } from './ReadAloudExercise';

export function ReadAloudPage() {
  const { questions, currentQuestion, currentIndex, isLoading, error, nextQuestion } = useReadAloud();
  if (isLoading || error || !currentQuestion) return (
    <section className="practice-card" aria-busy={isLoading}>
      <h2>Read Aloud</h2>
      {isLoading ? <p role="status">Loading Read Aloud…</p> : error ? <p role="alert">{error}</p> : <p>No Read Aloud passages are available.</p>}
    </section>
  );
  return <ReadAloudExercise key={currentQuestion.id} item={currentQuestion} mode={{ kind: 'standalone' }}
    progress={{ currentIndex, total: questions.length }} onNext={nextQuestion} />;
}
