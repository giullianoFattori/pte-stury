import { useListeningMultipleChoiceMultiple } from './hooks/useListeningMultipleChoiceMultiple.ts';
import { ListeningMultipleChoiceMultipleExercise } from './ListeningMultipleChoiceMultipleExercise.tsx';

export function ListeningMultipleChoiceMultiplePage() {
  const { items, item, index, loading, error, next } = useListeningMultipleChoiceMultiple();
  if (loading || error || !item) return <section className="practice-card" aria-busy={loading}><h2>Listening Multiple Choice — Multiple Answers</h2>{loading ? <p role="status">Loading listening questions…</p> : <p role="alert">{error ?? 'No multiple choice passages are available.'}</p>}</section>;
  return <ListeningMultipleChoiceMultipleExercise key={item.id} item={item} mode={{ kind: 'standalone' }} progress={{ currentIndex: index, total: items.length }} onNext={next} />;
}
