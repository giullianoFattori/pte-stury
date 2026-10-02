import { useEffect, useState } from 'react';

import { studyItemsRepository } from '../../../data/repositories/studyItemsRepository';
import type { StudyItem } from '../../../domain/pte/types';

export function useRepeatSentence() {
  const [questions, setQuestions] = useState<StudyItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadQuestions() {
      try {
        const items = await studyItemsRepository.getByTaskType('repeat-sentence');
        if (isMounted) {
          setQuestions(items);
          setError(null);
        }
      } catch (unknownError) {
        if (isMounted) {
          console.error('Failed to load Repeat Sentence questions:', unknownError);
          setError('Unable to load Repeat Sentence questions.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadQuestions();
    return () => {
      isMounted = false;
    };
  }, []);

  function nextQuestion() {
    if (questions.length > 0) {
      setCurrentIndex((current) => (current + 1) % questions.length);
    }
  }

  return {
    questions,
    currentQuestion: questions[currentIndex],
    currentIndex,
    isLoading,
    error,
    nextQuestion,
  };
}
