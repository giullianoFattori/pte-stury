import { useReadingFillBlanksDropdown } from './hooks/useReadingFillBlanksDropdown.ts';
import { ReadingFillBlanksDropdownExercise } from './ReadingFillBlanksDropdownExercise.tsx';

export function ReadingFillBlanksDropdownPage() {
  const { items, item, index, loading, error, next } = useReadingFillBlanksDropdown();
  if (loading || error || !item) return <section className="practice-card" aria-busy={loading}><h2>Reading: Fill in the Blanks — Dropdown</h2>{loading ? <p role="status">Loading reading passages…</p> : <p role="alert">{error ?? 'No dropdown passages are available.'}</p>}</section>;
  return <ReadingFillBlanksDropdownExercise key={item.id} item={item} mode={{ kind: 'standalone' }} progress={{ currentIndex: index, total: items.length }} onNext={next} />;
}
