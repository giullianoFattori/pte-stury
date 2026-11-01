import { useReorderParagraph } from './hooks/useReorderParagraph.ts';
import { ReorderParagraphExercise } from './ReorderParagraphExercise.tsx';

export function ReorderParagraphPage() {
  const { items, item, index, loading, error, next } = useReorderParagraph();
  if (loading || error || !item) return <section className="practice-card" aria-busy={loading}><h2>Reorder Paragraph</h2>{loading ? <p role="status">Loading paragraph sets…</p> : <p role="alert">{error ?? 'No Reorder Paragraph items are available.'}</p>}</section>;
  return <ReorderParagraphExercise key={item.id} item={item} mode={{ kind: 'standalone' }} progress={{ currentIndex: index, total: items.length }} onNext={next} />;
}
