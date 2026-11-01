import { useListeningFillBlanksTypeIn } from './hooks/useListeningFillBlanksTypeIn.ts';
import { ListeningFillBlanksTypeInExercise } from './ListeningFillBlanksTypeInExercise.tsx';

export function ListeningFillBlanksTypeInPage() {
  const { items, item, index, loading, error, next } = useListeningFillBlanksTypeIn();
  if (loading || error || !item) return <section className="practice-card" aria-busy={loading}><h2>Listening: Fill in the Blanks — Type In</h2>{loading ? <p role="status">Loading items…</p> : <p role="alert">{error ?? 'No practice items are available.'}</p>}</section>;
  return <ListeningFillBlanksTypeInExercise key={item.id} item={item} mode={{ kind: 'standalone' }} progress={{ currentIndex: index, total: items.length }} onNext={next} />;
}
