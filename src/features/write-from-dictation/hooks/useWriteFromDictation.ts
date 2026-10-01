import { useEffect, useRef, useState } from 'react';

import { attemptsRepository } from '../../../data/repositories/attemptsRepository';
import { studyItemsRepository } from '../../../data/repositories/studyItemsRepository';
import type { StudyItem } from '../../../domain/pte/types';
import {
  calculateWfdMetrics,
  compareWfdAnswer,
  type WfdComparisonResult,
  type WfdScoreResult,
} from '../../../domain/scoring/wfd';
import { buildWfdAttempt } from '../services/buildWfdAttempt';

export function useWriteFromDictation() {
  const [questions, setQuestions] = useState<StudyItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [comparison, setComparison] = useState<WfdComparisonResult | null>(null);
  const [score, setScore] = useState<WfdScoreResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAttemptId, setSavedAttemptId] = useState<string | null>(null);
  const attemptStartedAtRef = useRef(0);
  // A synchronous lock also blocks two submissions before React renders again.
  const submissionStateRef = useRef<'idle' | 'saving' | 'saved'>('idle');
  const isMountedRef = useRef(false);
  const currentQuestion = questions[currentIndex];

  useEffect(() => {
    let isMounted = true;
    isMountedRef.current = true;

    async function loadQuestions() {
      try {
        const items = await studyItemsRepository.getByTaskType('write-from-dictation');

        if (isMounted) {
          attemptStartedAtRef.current = performance.now();
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
      isMountedRef.current = false;
    };
  }, []);

  function updateAnswer(value: string) {
    if (submissionStateRef.current === 'saving') {
      return;
    }

    submissionStateRef.current = 'idle';
    setAnswer(value);
    setIsSubmitted(false);
    setComparison(null);
    setScore(null);
    setSaveError(null);
    setSavedAttemptId(null);
  }

  async function submitAnswer() {
    if (!answer.trim() || !currentQuestion?.answer || submissionStateRef.current !== 'idle') {
      return;
    }

    submissionStateRef.current = 'saving';
    setIsSaving(true);
    setSaveError(null);

    try {
      const comparisonResult = compareWfdAnswer(currentQuestion.answer, answer);
      const scoreResult = calculateWfdMetrics(comparisonResult);
      const durationMs = Math.round(performance.now() - attemptStartedAtRef.current);
      const attempt = buildWfdAttempt({
        question: currentQuestion,
        answer,
        comparison: comparisonResult,
        score: scoreResult,
        durationMs,
      });

      await attemptsRepository.create(attempt);
      submissionStateRef.current = 'saved';

      if (isMountedRef.current) {
        setComparison(comparisonResult);
        setScore(scoreResult);
        setSavedAttemptId(attempt.id);
        setIsSubmitted(true);
      }
    } catch (unknownError) {
      submissionStateRef.current = 'idle';
      console.error('Failed to save WFD attempt:', unknownError);

      if (isMountedRef.current) {
        setSaveError('Your attempt could not be saved. Please try again.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  }

  function nextQuestion() {
    if (questions.length === 0 || submissionStateRef.current === 'saving') {
      return;
    }

    setCurrentIndex((current) => (current + 1) % questions.length);
    setAnswer('');
    setIsSubmitted(false);
    setComparison(null);
    setScore(null);
    setSavedAttemptId(null);
    setSaveError(null);
    submissionStateRef.current = 'idle';
    attemptStartedAtRef.current = performance.now();
  }

  return {
    questions,
    currentQuestion,
    currentIndex,
    answer,
    isLoading,
    error,
    isSubmitted,
    comparison,
    score,
    isSaving,
    saveError,
    savedAttemptId,
    updateAnswer,
    submitAnswer,
    nextQuestion,
  };
}
