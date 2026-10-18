import { useEffect, useState } from 'react';
import { studyItemsRepository } from '../../../data/repositories/studyItemsRepository';
import type { StudyItem } from '../../../domain/pte/types';
export function useRetellLecture() {
  const [items, setItems] = useState<StudyItem[]>([]); const [index, setIndex] = useState(0); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  useEffect(() => { let active = true; void studyItemsRepository.getByTaskType('retell-lecture').then(rows => { if (active) setItems(rows); }).catch(() => { if (active) setError('Unable to load Retell Lecture items.'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  return { items, item: items[index], index, loading, error, next: () => setIndex(i => (i + 1) % Math.max(1, items.length)) };
}
