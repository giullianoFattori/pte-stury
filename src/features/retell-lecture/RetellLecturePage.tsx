import { useRetellLecture } from './hooks/useRetellLecture';
import { RetellLectureExercise } from './RetellLectureExercise';
export function RetellLecturePage() {
  const { items, item, index, loading, error, next } = useRetellLecture();
  if (loading || error || !item) return <section className="practice-card" aria-busy={loading}><h2>Retell Lecture</h2>{loading ? <p role="status">Loading Retell Lecture…</p> : <p role="alert">{error ?? 'No Retell Lecture items are available.'}</p>}</section>;
  return <RetellLectureExercise key={item.id} item={item} mode={{ kind: 'standalone' }} progress={{ currentIndex: index, total: items.length }} onNext={next} />;
}
