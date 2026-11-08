import { useReadingMultipleChoiceMultiple } from './hooks/useReadingMultipleChoiceMultiple.ts';
import { ReadingMultipleChoiceMultipleExercise } from './ReadingMultipleChoiceMultipleExercise.tsx';

export function ReadingMultipleChoiceMultiplePage() {
  const { items, item, index, loading, error, next } = useReadingMultipleChoiceMultiple();
  if (loading || error || !item) return <section className="practice-card" aria-busy={loading}><h2>Reading Multiple Choice — Multiple Answers</h2>{loading ? <p role="status">Loading reading passages…</p> : <p role="alert">{error ?? 'No multiple choice passages are available.'}</p>}</section>;
  return <ReadingMultipleChoiceMultipleExercise key={item.id} item={item} mode={{ kind: 'standalone' }} progress={{ currentIndex: index, total: items.length }} onNext={next} />;
}
