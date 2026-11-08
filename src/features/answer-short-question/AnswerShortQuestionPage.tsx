import { useAnswerShortQuestion } from './hooks/useAnswerShortQuestion.ts';
import { AnswerShortQuestionExercise } from './AnswerShortQuestionExercise.tsx';
export function AnswerShortQuestionPage() {
  const { items, item, index, loading, error, next } = useAnswerShortQuestion();
  if (loading || error || !item) return <section className="practice-card" aria-busy={loading}><h2>Answer Short Question</h2>{loading ? <p role="status">Loading questions…</p> : <p role="alert">{error ?? 'No Answer Short Question items are available.'}</p>}</section>;
  return <AnswerShortQuestionExercise key={item.id} item={item} mode={{ kind: 'standalone' }} progress={{ currentIndex: index, total: items.length }} onNext={next} />;
}
