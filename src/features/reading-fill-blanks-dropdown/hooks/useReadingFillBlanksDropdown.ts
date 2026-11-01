import { useEffect, useState } from 'react';
import { studyItemsRepository } from '../../../data/repositories/studyItemsRepository.ts';
import type { StudyItem } from '../../../domain/pte/types.ts';

export function useReadingFillBlanksDropdown() {
  const [items, setItems] = useState<StudyItem[]>([]), [index, setIndex] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void studyItemsRepository.getByTaskType('reading-fill-blanks-dropdown').then(rows => { if (active) setItems(rows); })
      .catch(() => { if (active) setError('Unable to load Reading Fill in the Blanks — Dropdown items.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return { items, item: items[index], index, loading, error, next: () => setIndex(value => (value + 1) % Math.max(1, items.length)) };
}
