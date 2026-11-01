import { useReadingFillBlanksDragDrop } from './hooks/useReadingFillBlanksDragDrop.ts';
import { ReadingFillBlanksDragDropExercise } from './ReadingFillBlanksDragDropExercise.tsx';

export function ReadingFillBlanksDragDropPage() {
  const { items, item, index, loading, error, next } = useReadingFillBlanksDragDrop();
  if (loading || error || !item) return <section className="practice-card" aria-busy={loading}><h2>Reading: Fill in the Blanks — Drag and Drop</h2>{loading ? <p role="status">Loading reading passages…</p> : <p role="alert">{error ?? 'No Drag and Drop passages are available.'}</p>}</section>;
  return <ReadingFillBlanksDragDropExercise key={item.id} item={item} mode={{ kind: 'standalone' }} progress={{ currentIndex: index, total: items.length }} onNext={next} />;
}
