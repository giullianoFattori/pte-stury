import { useEffect, useState } from 'react';

import { studyItemsRepository } from '../../../data/repositories/studyItemsRepository';
import type { StudyItem } from '../../../domain/pte/types';

export function useWriteFromDictation() {
  const [questions, setQuestions] = useState<StudyItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadQuestions() {
      try {
        const items = await studyItemsRepository.getByTaskType('write-from-dictation');

        if (isMounted) {
          setQuestions(items);
          setError(null);
        }
      } catch (unknownError) {
        if (isMounted) {
          console.error('Failed to load WFD questions:', unknownError);
          setError('Unable to load Write From Dictation questions.');
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

  function updateAnswer(value: string) {
    setAnswer(value);
    setIsSubmitted(false);
  }

  function submitAnswer() {
    if (answer.trim()) {
      setIsSubmitted(true);
    }
  }

  function nextQuestion() {
    if (questions.length === 0) {
      return;
    }

    setCurrentIndex((current) => (current + 1) % questions.length);
    setAnswer('');
    setIsSubmitted(false);
  }

  return {
    questions,
    currentQuestion: questions[currentIndex],
    currentIndex,
    answer,
    isLoading,
    error,
    isSubmitted,
    updateAnswer,
    submitAnswer,
    nextQuestion,
  };
}
