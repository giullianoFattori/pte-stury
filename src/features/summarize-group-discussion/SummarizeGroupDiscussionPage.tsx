import { useSummarizeGroupDiscussion } from './hooks/useSummarizeGroupDiscussion';
import { SummarizeGroupDiscussionExercise } from './SummarizeGroupDiscussionExercise';

export function SummarizeGroupDiscussionPage() {
  const { items, item, index, loading, error, next } = useSummarizeGroupDiscussion();
  if (loading || error || !item) return <section className="practice-card" aria-busy={loading}><h2>Summarize Group Discussion</h2>
    {loading ? <p role="status">Loading discussions…</p> : <p role="alert">{error ?? 'No discussion items are available.'}</p>}</section>;
  return <SummarizeGroupDiscussionExercise key={item.id} item={item} mode={{ kind: 'standalone' }} progress={{ currentIndex: index, total: items.length }} onNext={next} />;
}
