import { useEffect, useState } from 'react';
import { studyItemsRepository } from '../../../data/repositories/studyItemsRepository.ts';
import type { StudyItem } from '../../../domain/pte/types.ts';

export function useListeningMultipleChoiceMultiple() {
  const [items, setItems] = useState<StudyItem[]>([]), [index, setIndex] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void studyItemsRepository.getByTaskType('listening-multiple-choice-multiple').then(rows => { if (active) setItems(rows); })
      .catch(() => { if (active) setError('Unable to load Listening Multiple Choice — Multiple Answers items.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return { items, item: items[index], index, loading, error, next: () => setIndex(value => (value + 1) % Math.max(1, items.length)) };
}
